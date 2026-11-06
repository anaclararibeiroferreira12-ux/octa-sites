// Liga um exemplo (Mineiro Burger, Casa do Pão...) ao servidor de pedidos.
// Só funciona quando o link tem ?loja=CODIGO. Sem isso, o exemplo continua
// funcionando só dentro do próprio aparelho, como antes.
(function(){
  function loja(){
    var m = location.search.match(/[?&]loja=([a-z0-9-]{3,40})/i);
    return m ? m[1].toLowerCase() : null;
  }

  // op: { loja, dados: function(){...}, receber: function(estado){...} }
  function iniciar(op){
    var url = '/api/loja/' + op.loja;
    var enviado = {};   // última versão de cada pedido/chamado que o servidor já tem
    var versao = 0, emVoo = 0, primeiro = true;

    function marcar(e){
      (e.pedidos || []).forEach(function(o){ enviado['p' + o.id] = JSON.stringify(o); });
      (e.chamados || []).forEach(function(o){ enviado['c' + o.id] = JSON.stringify(o); });
    }
    function aplicar(r){
      if (!r || !Array.isArray(r.pedidos)) return;
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
      fetch(url, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({muds:muds})})
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
      fetch(url + '?v=' + versao, {cache:'no-store'})
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(r){ if (r && !emVoo && r.v !== versao) aplicar(r); else if (r && primeiro) aplicar(Object.assign({pedidos:[], chamados:[], prox:1, proxCh:1}, r)); })
        .catch(function(){});
    }
    setTimeout(buscar, 50);
    setInterval(buscar, 2000);
    return { enviar: enviar };
  }

  window.OctaSync = { loja: loja, iniciar: iniciar };
})();
