// Servidor de pedidos dos exemplos (Mineiro Burger, Casa do Pão...).
// Cada loja tem um código (ex.: "teste-ana") e guarda seus pedidos e chamados
// num Durable Object próprio. O celular do cliente manda o pedido e o painel
// no computador busca os pedidos novos a cada 2 segundos.
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

function valido(o) {
  return o && typeof o === "object" && Number.isInteger(o.id) && o.id > 0 && o.id < 1e7;
}

// Junta uma mudança (pedido ou chamado) ao estado. Se o número já é de outro
// pedido (dois celulares pedindo ao mesmo tempo), dá um número novo.
function juntar(estado, tipo, o, remap) {
  const lista = tipo === "p" ? estado.pedidos : estado.chamados;
  const campoProx = tipo === "p" ? "prox" : "proxCh";
  const i = lista.findIndex((x) => x.id === o.id);
  if (i >= 0 && lista[i].t === o.t) {
    lista[i] = o;
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
    const url = new URL(req.url);
    let estado = (await this.ctx.storage.get("estado")) || estadoVazio();

    if (req.method === "GET") {
      const v = Number(url.searchParams.get("v"));
      if (v === estado.v && estado.v > 0) return json({ v: estado.v });
      return json(estado);
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
        juntar(estado, m.t, m.o, remap);
      }
      if (estado.pedidos.length > LIMITE_PEDIDOS) estado.pedidos = estado.pedidos.slice(-LIMITE_PEDIDOS);
      if (estado.chamados.length > LIMITE_CHAMADOS) estado.chamados = estado.chamados.slice(-LIMITE_CHAMADOS);
      estado.v += 1;
      await this.ctx.storage.put("estado", estado);
      return json(Object.assign({}, estado, { remap }));
    }

    if (req.method === "DELETE") {
      estado = estadoVazio();
      estado.v = Date.now();
      await this.ctx.storage.put("estado", estado);
      return json(estado);
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
