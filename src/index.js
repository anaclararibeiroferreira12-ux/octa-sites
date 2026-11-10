// Servidor de pedidos dos exemplos (Mineiro Burger, Casa do Pão...).
// Cada loja tem um código (ex.: "teste-ana") e guarda seus pedidos e chamados
// num Durable Object próprio. O celular do cliente manda o pedido e o painel
// no computador busca os pedidos novos a cada 2 segundos.
//
// Senha do painel: o painel abre com &chave=SENHA no link. A primeira chave
// usada numa loja fica guardada como a senha dela. Sem a senha:
// - dá para mandar pedidos e chamados novos (é o que o celular do cliente faz);
// - não dá para mudar pedidos que já existem, nem apagar a loja;
// - os pedidos voltam sem nome, endereço, WhatsApp e observações.
import { DurableObject } from "cloudflare:workers";

const LIMITE_PEDIDOS = 300;
const LIMITE_CHAMADOS = 300;
const LIMITE_CORPO = 256 * 1024;

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function estadoVazio() {
  return { v: 0, prox: 1, proxCh: 1, pedidos: [], chamados: [] };
}

const CAMPOS_PRIVADOS = ["nome", "end", "zap", "obs", "tel", "troco"];

function semDadosPessoais(estado) {
  const limpar = (o) => {
    const c = Object.assign({}, o);
    for (const k of CAMPOS_PRIVADOS) delete c[k];
    return c;
  };
  return Object.assign({}, estado, {
    chave: undefined,
    pedidos: estado.pedidos.map(limpar),
    chamados: estado.chamados.map(limpar),
  });
}

function valido(o) {
  return o && typeof o === "object" && Number.isInteger(o.id) && o.id > 0 && o.id < 1e7;
}

// Junta uma mudança (pedido ou chamado) ao estado. Se o número já é de outro
// pedido (dois celulares pedindo ao mesmo tempo), dá um número novo.
function juntar(estado, tipo, o, remap, dono) {
  const lista = tipo === "p" ? estado.pedidos : estado.chamados;
  const campoProx = tipo === "p" ? "prox" : "proxCh";
  const i = lista.findIndex((x) => x.id === o.id);
  if (i >= 0 && lista[i].t === o.t) {
    if (dono) lista[i] = o; // só o painel (com a senha) muda um pedido que já existe
    return;
  }
  if (i >= 0) {
    const de = o.id;
    o = Object.assign({}, o, { id: estado[campoProx] });
    remap.push({ t: tipo, de, para: o.id });
  }
  lista.push(o);
  estado[campoProx] = Math.max(estado[campoProx], o.id + 1);
}

export class Loja extends DurableObject {
  async fetch(req) {
    let estado = (await this.ctx.storage.get("estado")) || estadoVazio();
    const url = new URL(req.url);
    const chave = (req.headers.get("x-chave") || "").trim().toLowerCase();
    const chaveOk = /^[a-z0-9-]{4,40}$/.test(chave);
    let senha = await this.ctx.storage.get("senha");
    if (!senha && chaveOk) {
      senha = chave; // primeira senha usada nesta loja
      await this.ctx.storage.put("senha", senha);
    }
    const dono = chaveOk && chave === senha;
    const resposta = (e) => (dono ? e : semDadosPessoais(e));

    if (req.method === "GET") {
      const v = Number(url.searchParams.get("v"));
      if (v === estado.v && estado.v > 0) return json({ v: estado.v, dono });
      return json(Object.assign(resposta(estado), { dono }));
    }

    if (req.method === "POST") {
      const texto = await req.text();
      if (texto.length > LIMITE_CORPO) return json({ erro: "grande demais" }, 413);
      let corpo;
      try { corpo = JSON.parse(texto); } catch (e) { return json({ erro: "json inválido" }, 400); }
      const muds = Array.isArray(corpo && corpo.muds) ? corpo.muds.slice(0, 100) : [];
      const remap = [];
      for (const m of muds) {
        if (!m || (m.t !== "p" && m.t !== "c") || !valido(m.o)) continue;
        juntar(estado, m.t, m.o, remap, dono);
      }
      if (estado.pedidos.length > LIMITE_PEDIDOS) estado.pedidos = estado.pedidos.slice(-LIMITE_PEDIDOS);
      if (estado.chamados.length > LIMITE_CHAMADOS) estado.chamados = estado.chamados.slice(-LIMITE_CHAMADOS);
      estado.v += 1;
      await this.ctx.storage.put("estado", estado);
      return json(Object.assign(resposta(estado), { remap, dono }));
    }

    if (req.method === "DELETE") {
      if (!dono) return json({ erro: "senha do painel errada" }, 403);
      estado = estadoVazio();
      estado.v = Date.now();
      await this.ctx.storage.put("estado", estado);
      return json(Object.assign({}, estado, { dono }));
    }

    return json({ erro: "método não aceito" }, 405);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/loja\/([a-z0-9-]{3,40})$/i);
    if (m) {
      const id = env.LOJAS.idFromName(m[1].toLowerCase());
      return env.LOJAS.get(id).fetch(req);
    }
    if (url.pathname.startsWith("/api/")) return json({ erro: "não encontrado" }, 404);
    return env.ASSETS.fetch(req);
  },
};
