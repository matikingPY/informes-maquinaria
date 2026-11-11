/* Cálculos del control de combustible (mismos criterios que la planilla Excel). Sin dependencias. */
(function (root) {
  function vig(a) { return (a || []).filter(function (o) { return o.estado === 'vigente'; }); }
  function sum(a, f) { return a.reduce(function (t, o) { return t + (Number(f(o)) || 0); }, 0); }

  /* Cada salida: horómetro anterior de la misma máquina (el mayor menor al actual), uso, consumo real, desvío, estado */
  function salidas(data) {
    var S = vig(data.salidas), eq = {};
    data.equipos.forEach(function (e) { eq[e.codigo] = e; });
    var cierresKey = {};
    vig(data.cierres).forEach(function (c) { cierresKey[c.fecha + '|' + c.camion] = true; });
    var tol = data.params.tolSobreconsumo; if (tol == null) tol = 0.15;
    var informes = {}; S.forEach(function (s) { var k = String(s.informe).toLowerCase(); informes[k] = (informes[k] || 0) + 1; });
    return S.map(function (s) {
      var q = eq[s.codigo], prev = null;
      S.forEach(function (o) { if (o.codigo === s.codigo && o.horometro < s.horometro && (prev === null || o.horometro > prev)) prev = o.horometro; });
      var uso = prev === null ? null : s.horometro - prev;
      var real = (uso !== null && uso > 0) ? s.litros / uso : null;
      var teo = q && q.teorico ? q.teorico : null;
      var desv = (real !== null && teo !== null) ? real / teo - 1 : null;
      var estado = !q ? 'Código inválido' : real === null ? '1ª carga (sin ref.)' : teo === null ? 'Sin teórico' : desv > tol ? 'SOBRECONSUMO' : 'Normal';
      var control = 'OK';
      if (informes[String(s.informe).toLowerCase()] > 1) control = 'N° informe repetido';
      else if (desv !== null && (desv < -0.6 || desv > 1.5)) control = 'Revisar horómetro o litros';
      else if (!cierresKey[s.fecha + '|' + s.camion]) control = 'Falta cierre de taxilitro';
      return Object.assign({}, s, { nombre: q ? q.nombre : '', operador: q ? q.operador : '', tipo: q ? (q.tipo || '') : '', prev: prev, uso: uso, real: real, teorico: teo, desvio: desv, estadoCalc: estado, control: control, litrosMed: real !== null ? s.litros : 0, usoMed: real !== null ? uso : 0 });
    });
  }

  /* Cierre diario por camión: taxilitro inicial = último cierre anterior o apertura */
  function cierres(data) {
    var C = vig(data.cierres), SA = vig(data.salidas), EN = vig(data.entradas);
    var tolTx = data.params.tolTaxilitro; if (tolTx == null) tolTx = 20;
    var tolSt = data.params.tolStock; if (tolSt == null) tolSt = 100;
    var cam = {}; data.camiones.forEach(function (c) { cam[c.camion] = c; });
    return C.map(function (c) {
      var ap = cam[c.camion] || { taxilitroApertura: 0, stockInicial: 0 }, ini = ap.taxilitroApertura;
      C.forEach(function (o) { if (o.camion === c.camion && o.fecha < c.fecha && o.taxilitro > ini) ini = o.taxilitro; });
      var desp = c.taxilitro - ini;
      var inf = sum(SA.filter(function (s) { return s.camion === c.camion && s.fecha === c.fecha; }), function (s) { return s.litros; });
      var dif = desp - inf;
      var entDia = sum(EN.filter(function (e) { return e.camion === c.camion && e.fecha === c.fecha; }), function (e) { return e.litros; });
      var entAcum = sum(EN.filter(function (e) { return e.camion === c.camion && e.fecha <= c.fecha; }), function (e) { return e.litros; });
      var stockT = ap.stockInicial + entAcum - (c.taxilitro - ap.taxilitroApertura);
      var difSt = (c.stock === null || c.stock === '' || c.stock === undefined) ? null : c.stock - stockT;
      return Object.assign({}, c, { inicial: ini, despachado: desp, informes: inf, diferencia: dif, cierra: Math.abs(dif) <= tolTx, entradasDia: entDia, stockTeorico: stockT, difStock: difSt, stockOk: difSt === null ? null : Math.abs(difSt) <= tolSt, retrocede: desp < 0 });
    }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  }

  /* Vista previa mientras se escribe una salida nueva (sin guardarla todavía) */
  function previa(data, nueva) {
    var fake = { equipos: data.equipos, params: data.params, camiones: data.camiones, cierres: data.cierres, entradas: data.entradas,
      salidas: (data.salidas || []).concat([Object.assign({ estado: 'vigente', id: '__nueva__' }, nueva)]) };
    var r = salidas(fake); return r[r.length - 1];
  }

  /* Reporte para un período [desde, hasta] (yyyy-MM-dd) con filtros opcionales:
     f = { codigos:[], tipo:'', operador:'', camion:'', estado:'', desvioMin:null }  (estado: sobre | normal | revisar | sinteorico | primera) */
  function reporte(data, desde, hasta, f) {
    f = f || {};
    var cods = f.codigos || [], dmin = (f.desvioMin === null || f.desvioMin === undefined || f.desvioMin === '') ? null : Number(f.desvioMin) / 100;
    var tol = data.params.tolSobreconsumo; if (tol == null) tol = 0.15;
    function okEstado(s) {
      switch (f.estado) {
        case 'sobre': return s.estadoCalc === 'SOBRECONSUMO';
        case 'normal': return s.estadoCalc === 'Normal';
        case 'revisar': return s.control !== 'OK';
        case 'sinteorico': return s.estadoCalc === 'Sin teórico';
        case 'primera': return s.estadoCalc === '1ª carga (sin ref.)';
        default: return true;
      }
    }
    var rows = salidas(data).filter(function (s) {
      return s.fecha >= desde && s.fecha <= hasta && (!f.camion || s.camion === f.camion) && (!cods.length || cods.indexOf(s.codigo) >= 0) &&
        (!f.tipo || s.tipo === f.tipo) && (!f.operador || s.operador === f.operador) && okEstado(s) && (dmin === null || (s.desvio !== null && s.desvio >= dmin));
    });
    var maq = data.equipos.filter(function (e) {
      return (!cods.length || cods.indexOf(e.codigo) >= 0) && (!f.tipo || (e.tipo || '') === f.tipo) && (!f.operador || e.operador === f.operador);
    }).map(function (e) {
      var r = rows.filter(function (s) { return s.codigo === e.codigo; });
      var lit = sum(r, function (s) { return s.litros; }), lm = sum(r, function (s) { return s.litrosMed; }), um = sum(r, function (s) { return s.usoMed; });
      var real = um > 0 ? lm / um : null, teo = e.teorico || null, desv = (real !== null && teo !== null) ? real / teo - 1 : null;
      var est = r.length === 0 ? 'Sin cargas' : real === null ? 'Sin datos suficientes' : teo === null ? 'Sin teórico' : desv > tol ? 'SOBRECONSUMO' : 'Normal';
      return { codigo: e.codigo, nombre: e.nombre, tipo: e.tipo || '', operador: e.operador, cargas: r.length, litros: lit, litrosMed: lm, uso: um, real: real, teorico: teo, desvio: desv, estado: est,
        ultimoHorometro: r.length ? Math.max.apply(null, r.map(function (s) { return s.horometro; })) : null, ultimaCarga: r.length ? r.map(function (s) { return s.fecha; }).sort().pop() : null };
    }).filter(function (m) { return m.cargas > 0 && (dmin === null || (m.desvio !== null && m.desvio >= dmin)); });
    var cier = cierres(data).filter(function (c) { return c.fecha >= desde && c.fecha <= hasta && (!f.camion || c.camion === f.camion); });
    var resumen = { litros: sum(rows, function (s) { return s.litros; }), cargas: rows.length, sobreconsumo: maq.filter(function (m) { return m.estado === 'SOBRECONSUMO'; }).length,
      diasNoCierran: cier.filter(function (c) { return !c.cierra; }).length, sinCierre: rows.filter(function (s) { return s.control === 'Falta cierre de taxilitro'; }).length,
      aRevisar: rows.filter(function (s) { return s.control !== 'OK' && s.control !== 'Falta cierre de taxilitro'; }).length, maquinas: maq.length };
    return { rows: rows, maq: maq, cierres: cier, resumen: resumen };
  }

  /* Estado actual de cada camión (último cierre) */
  function camiones(data) {
    var ci = cierres(data);
    return data.camiones.map(function (c) {
      var mine = ci.filter(function (x) { return x.camion === c.camion; });
      var last = mine.length ? mine[mine.length - 1] : null;
      return { camion: c.camion, ultimo: last };
    });
  }

  var api = { salidas: salidas, cierres: cierres, previa: previa, reporte: reporte, camiones: camiones };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CombCalc = api;
})(typeof window !== 'undefined' ? window : this);
