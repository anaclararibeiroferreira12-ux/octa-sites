// Liga um exemplo (Mineiro Burger, Casa do Pão...) ao servidor de pedidos.
// Só funciona quando o link tem ?loja=CODIGO. Sem isso, o exemplo continua
// funcionando só dentro do próprio aparelho, como antes.
(function(){
  function loja(){
    var m = location.search.match(/[?&]loja=([a-z0-9-]{3,40})/i);
    return m ? m[1].toLowerCase() : null;
  }
  // Senha do painel: &chave=SENHA no link do computador da loja.
  // Sem ela, o aparelho funciona só como celular de cliente.
  function chave(){
    var m = location.search.match(/[?&]chave=([a-z0-9-]{4,40})/i);
    return m ? m[1].toLowerCase() : null;
  }

  // op: { loja, dados: function(){...}, receber: function(estado){...} }
  function iniciar(op){
    var url = '/api/loja/' + op.loja, ch = chave();
    var cab = ch ? {'x-chave': ch} : {};
    var enviado = {};   // última versão de cada pedido/chamado que o servidor já tem
    var versao = 0, emVoo = 0, primeiro = true;

    function marcar(e){
      (e.pedidos || []).forEach(function(o){ enviado['p' + o.id] = JSON.stringify(o); });
      (e.chamados || []).forEach(function(o){ enviado['c' + o.id] = JSON.stringify(o); });
    }
    // Sem a senha, o servidor devolve os pedidos sem nome, endereço etc.
    // Os pedidos feitos neste aparelho continuam com os dados que já estão aqui.
    function completar(r){
      if (r.dono) return;
      var d = op.dados() || {};
      [['pedidos', d.pedidos], ['chamados', d.chamados]].forEach(function(par){
        var meus = {}; (par[1] || []).forEach(function(o){ meus[o.id + '|' + o.t] = o; });
        (r[par[0]] || []).forEach(function(o){ var l = meus[o.id + '|' + o.t]; if (l) for (var k in l) if (!(k in o)) o[k] = l[k]; });
      });
    }
    function aplicar(r){
      if (!r || !Array.isArray(r.pedidos)) return;
      completar(r);
      versao = r.v;
      marcar(r);
      r.primeiro = primeiro; primeiro = false;
      op.receber(r);
    }
    function enviar(){
      if (primeiro) { setTimeout(enviar, 500); return; }
      var d = op.dados(), muds = [];
      (d.pedidos || []).forEach(function(o){ var j = JSON.stringify(o); if (enviado['p' + o.id] !== j) { muds.push({t:'p', o:o}); enviado['p' + o.id] = j; } });
      (d.chamados || []).forEach(function(o){ var j = JSON.stringify(o); if (enviado['c' + o.id] !== j) { muds.push({t:'c', o:o}); enviado['c' + o.id] = j; } });
      if (!muds.length) return;
      emVoo++;
      fetch(url, {method:'POST', headers:Object.assign({'content-type':'application/json'}, cab), body:JSON.stringify({muds:muds})})
        .then(function(r){ if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function(r){ emVoo--; aplicar(r); })
        .catch(function(){
          emVoo--;
          muds.forEach(function(m){ delete enviado[m.t + m.o.id]; });
          setTimeout(enviar, 3000);
        });
    }
    function buscar(){
      if (emVoo) return;
      // celular de cliente em segundo plano não fica consultando o servidor (o painel continua)
      if (document.hidden && !ch && !primeiro) return;
      fetch(url + '?v=' + versao, {cache:'no-store', headers:cab})
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(r){ if (r && !emVoo && r.v !== versao) aplicar(r); else if (r && primeiro) aplicar(Object.assign({pedidos:[], chamados:[], prox:1, proxCh:1}, r)); })
        .catch(function(){});
    }
    setTimeout(buscar, 50);
    setInterval(buscar, 2000);
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) buscar(); });
    return { enviar: enviar };
  }

  window.OctaSync = { loja: loja, chave: chave, iniciar: iniciar };
})();
