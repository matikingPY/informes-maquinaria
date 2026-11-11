/* Control de combustible – página web para la oficina. Usa el Apps Script de combustible. */
(function () {
  'use strict';
  var CFG = window.COMB_CONFIG, CC = window.CombCalc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $('#app'), who = $('#who'), toastEl = $('#toast'), dlg = $('#dlg');
  var S = { user: null, ced: null, pass: null, puedeCargar: false, step: 'cedula', nombre: '', data: null, tab: 'salidas', fecha: hoy(), camion: '', msg: '', busy: false, sel: null, repD: null, repH: null, preset: 'mes', f: { codigos: [], tipo: '', operador: '', camion: '', estado: '', desvioMin: '' }, sort: {} };
  try { S.user = sessionStorage.getItem('cb_user'); S.ced = sessionStorage.getItem('cb_ced'); S.pass = sessionStorage.getItem('cb_pass'); } catch (e) {}
  var lastCed = ''; try { lastCed = localStorage.getItem('cb_lastCed') || ''; } catch (e) {}

  /* ---------- utilidades ---------- */
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fnum(n, d) { if (n === null || n === undefined || n === '' || isNaN(n)) return '—'; if (Math.abs(n) < 0.05) n = 0; return Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 1 : d }); }
  function fdate(s) { return s ? String(s).split('-').reverse().join('/') : ''; }
  function pnum(s) { if (typeof s === 'number') return s; s = String(s || '').trim(); if (!s) return null; if (s.indexOf(',') >= 0 || /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); var n = Number(s); return isNaN(n) ? null : n; }
  function rid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function toast(t) { toastEl.textContent = t; toastEl.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.style.display = 'none'; }, 3200); }
  toastEl.style.display = 'none';
  var ERR = { clave_incorrecta: 'La clave de la página no coincide con el servidor.', login_incorrecto: 'Contraseña incorrecta.', login_requerido: 'Ingresá tu cédula y contraseña.', sin_acceso: 'Esa cédula no tiene acceso a esta página. Consultá con el Ingeniero Residente.', sin_permiso: 'Tu usuario solo puede ver reportes.', crear_clave: 'Tenés que crear tu contraseña.', clave_corta: 'La contraseña debe tener al menos 6 caracteres.', clave_ya_creada: 'Esa cédula ya tiene contraseña creada.', bloqueado: 'Demasiados intentos. Esperá 10 minutos.',
    fecha_invalida: 'La fecha no es válida.', fecha_futura: 'La fecha no puede ser futura.', camion_invalido: 'Elegí un camión de la lista.', codigo_invalido: 'Ese código de máquina no existe.', numero_invalido: 'Revisá los números (deben ser mayores a cero).',
    informe_requerido: 'Falta el N° de informe.', informe_repetido: 'Ese N° de informe ya está cargado.', cierre_repetido: 'Ese camión ya tiene un cierre cargado para esa fecha. Usá "Corregir" en la lista.', no_existe: 'Ese registro ya no existe.', ya_modificado: 'Ese registro ya fue corregido o anulado. Actualizá la lista.', error_servidor: 'Error del servidor. Probá de nuevo.', red: 'No hay conexión con el servidor. Revisá internet y probá de nuevo.' };
  function api(action, payload) {
    if (!CFG || /PEGAR/.test(CFG.API_URL)) return Promise.reject(new Error('sin_config'));
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 30000);
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctl.signal,
      body: JSON.stringify(Object.assign({ key: CFG.API_KEY, action: action, cedula: S.ced, pass: S.pass }, payload || {})) })
      .then(function (r) { return r.json(); }, function () { throw new Error('red'); })
      .then(function (j) { clearTimeout(t); if (!j.ok) throw new Error(j.error || 'error_servidor'); return j; }, function (e) { clearTimeout(t); throw e; });
  }
  function errTxt(e) { var m = e && e.message; return m === 'sin_config' ? 'Falta configurar la dirección del servidor (comb-config.js).' : (ERR[m] || ('Error: ' + m)); }

  /* ---------- carga de datos ---------- */
  function cargar(then) {
    return api('data').then(function (j) { S.data = j; S.puedeCargar = !!j.puedeCargar; S.user = j.user || S.user; if (!S.puedeCargar && ['salidas', 'cierre', 'entradas'].indexOf(S.tab) >= 0) S.tab = 'reportes'; if (S.puedeCargar && S.tab === 'excel') S.tab = 'salidas'; if (!S.camion && j.camiones.length) S.camion = j.camiones[0].camion; (then || render)(); })
      .catch(function (e) { if (/login|bloqueado|sin_acceso|crear_clave/.test(e.message)) { salir(true); S.msg = errTxt(e); } else S.msg = errTxt(e); render(); });
  }
  function salir(sinRender) { S.user = S.ced = S.pass = S.data = null; S.step = 'cedula'; S.puedeCargar = false; try { sessionStorage.clear(); } catch (e) {} if (!sinRender) render(); }

  /* ---------- pantallas ---------- */
  function render() {
    who.innerHTML = S.user && S.data ? 'Control de combustible · <b>' + esc(S.user) + '</b> <button class="link" data-a="salir">Salir</button>' : '';
    if (!S.user) return loginView();
    if (!S.data) { app.innerHTML = '<p class="muted">Cargando datos…</p>'; return; }
    var tabs = (S.puedeCargar ? [['salidas', 'Cargar salidas'], ['cierre', 'Cierre del camión'], ['entradas', 'Entradas']] : []).concat([['reportes', 'Reportes']]);
    app.innerHTML = '<div class="stack"><div class="tb">' + tabs.map(function (t) { return '<button data-a="tab" data-v="' + t[0] + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (S.msg ? '<div class="err" role="alert">' + esc(S.msg) + '</div>' : '') + '<div id="vista"></div></div>';
    var v = { salidas: vSalidas, cierre: vCierre, entradas: vEntradas, reportes: vReportes }[S.tab]; v();
    if (S.tab === 'salidas') actualizarPrevia(); if (S.tab === 'cierre') actualizarCierre();
  }
  function loginView() {
    var h = '<form class="card stack login" id="lf"><h1 style="font-size:1.5rem">Control de combustible</h1>' + (S.msg ? '<div class="err" role="alert">' + esc(S.msg) + '</div>' : '');
    if (S.step === 'cedula') h += '<p class="muted small">Ingresá tu número de cédula.</p><label class="f"><span>Cédula de identidad</span><input class="in mono" id="lc" inputmode="numeric" autocomplete="username" value="' + esc(lastCed) + '"></label><button class="btn primary" type="submit">Continuar</button>';
    else if (S.step === 'clave') h += '<p>Hola, <b>' + esc(S.nombre) + '</b>.</p><label class="f"><span>Contraseña</span><input class="in" id="lp" type="password" autocomplete="current-password"></label><button class="btn primary" type="submit">Entrar</button><button class="link" type="button" data-a="otra">No soy yo</button>';
    else h += '<p>Hola, <b>' + esc(S.nombre) + '</b>. Es tu primer ingreso: elegí una contraseña (mínimo 6 caracteres).</p><label class="f"><span>Nueva contraseña</span><input class="in" id="lp" type="password" autocomplete="new-password"></label><label class="f"><span>Repetir contraseña</span><input class="in" id="lp2" type="password" autocomplete="new-password"></label><button class="btn primary" type="submit">Crear contraseña y entrar</button><button class="link" type="button" data-a="otra">No soy yo</button>';
    app.innerHTML = h + '</form>';
    setTimeout(function () { var el = $('#lc') || $('#lp'); if (el) el.focus(); }, 30);
  }
  function camOpts(sel) { return S.data.camiones.map(function (c) { return '<option' + (c.camion === sel ? ' selected' : '') + '>' + esc(c.camion) + '</option>'; }).join(''); }

  /* ----- Salidas ----- */
  function nextInforme() {
    var n = S.data.salidas.filter(function (s) { return s.estado === 'vigente'; }).map(function (s) { return Number(s.informe); }).filter(function (x) { return x > 0 && isFinite(x); });
    return n.length ? String(Math.max.apply(null, n) + 1) : '';
  }
  function vSalidas() {
    var d = S.data, hoyRows = CC.salidas(d).filter(function (s) { return s.fecha === S.fecha; });
    var total = hoyRows.reduce(function (t, s) { return t + s.litros; }, 0);
    $('#vista').innerHTML = '<div class="stack"><form class="card stack" id="fs"><div class="eyebrow">Nueva salida de combustible</div>' +
      '<div class="fgrid"><label class="f"><span>Fecha</span><input class="in mono" type="date" id="s_fecha" value="' + S.fecha + '" max="' + hoy() + '" required></label>' +
      '<label class="f"><span>N° informe</span><input class="in mono" id="s_inf" value="' + esc(nextInforme()) + '" required></label>' +
      '<label class="f"><span>Camión</span><select class="in" id="s_cam">' + camOpts(S.camion) + '</select></label>' +
      '<label class="f wide2"><span>Máquina (código o nombre)</span><input class="in" id="s_cod" list="dl_eq" autocomplete="off" placeholder="Ej.: MN-029" required></label>' +
      '<datalist id="dl_eq">' + d.equipos.map(function (e) { return '<option value="' + esc(e.codigo) + '">' + esc(e.nombre + (e.operador ? ' · ' + e.operador : '')) + '</option>'; }).join('') + '</datalist>' +
      '<label class="f"><span>Horómetro / km</span><input class="in mono" id="s_hor" inputmode="decimal" required></label>' +
      '<label class="f"><span>Litros</span><input class="in mono" id="s_lit" inputmode="decimal" required></label>' +
      '<button class="btn primary" type="submit" id="s_ok" style="min-height:56px">Guardar y siguiente</button></div>' +
      '<div class="prev small" id="s_prev">Elegí la máquina para ver su último horómetro y el consumo.</div></form>' +
      '<div class="card"><div class="sec" style="margin:0 0 8px"><div class="eyebrow">Cargadas el ' + fdate(S.fecha) + ' · ' + hoyRows.length + ' informes · ' + fnum(total, 1) + ' L</div></div><div class="scroll">' + tablaSalidas(hoyRows) + '</div></div></div>';
    setTimeout(function () { var el = $('#s_cod'); if (el) el.focus(); }, 30);
  }
  function pill(t, cls) { return '<span class="pill ' + cls + '">' + esc(t) + '</span>'; }
  function estPill(s) { var e = s.estadoCalc; return pill(e, e === 'SOBRECONSUMO' ? 'crit' : e === 'Normal' ? 'ok' : e === 'Código inválido' ? 'crit' : e === 'Sin teórico' ? 'warn' : ''); }
  function tablaSalidas(rows) {
    if (!rows.length) return '<p class="muted small">Todavía no hay informes cargados para esta fecha.</p>';
    return '<table class="tbl"><thead><tr><th>N°</th><th>Máquina</th><th>Operador</th><th class="num">Horóm.</th><th class="num">Litros</th><th class="num">Consumo real</th><th>Estado</th><th>Control</th><th></th></tr></thead><tbody>' +
      rows.slice().reverse().map(function (s) { return '<tr><td class="mono">' + esc(s.informe) + '</td><td><b>' + esc(s.codigo) + '</b> <span class="muted small">' + esc(s.nombre) + '</span></td><td>' + esc(s.operador) + '</td><td class="num mono">' + fnum(s.horometro, 1) + '</td><td class="num mono">' + fnum(s.litros, 1) + '</td><td class="num mono">' + (s.real === null ? '—' : fnum(s.real, 2)) + '</td><td>' + estPill(s) + '</td><td>' + (s.control === 'OK' ? pill('OK', 'ok') : pill(s.control, 'warn')) + '</td><td class="nowrap"><button class="link" data-a="fix" data-t="salida" data-id="' + esc(s.id) + '">Corregir</button> <button class="link" data-a="anular" data-t="salida" data-id="' + esc(s.id) + '">Anular</button></td></tr>'; }).join('') + '</tbody></table>';
  }
  function resolverCodigo(txt) {
    txt = String(txt || '').trim().toUpperCase(); if (!txt) return null;
    var e = S.data.equipos.filter(function (q) { return q.codigo.toUpperCase() === txt; })[0]; return e || null;
  }
  function actualizarPrevia() {
    var el = $('#s_prev'); if (!el) return;
    var e = resolverCodigo($('#s_cod').value);
    if (!$('#s_cod').value.trim()) { el.textContent = 'Elegí la máquina para ver su último horómetro y el consumo.'; return; }
    if (!e) { el.innerHTML = '<span class="pill crit">Código no encontrado</span>'; return; }
    var prevH = null; CC.salidas(S.data).forEach(function (s) { if (s.codigo === e.codigo && (prevH === null || s.horometro > prevH)) prevH = s.horometro; });
    var h = pnum($('#s_hor').value), l = pnum($('#s_lit').value), t = '<b>' + esc(e.codigo) + '</b> · ' + esc(e.nombre) + (e.operador ? ' · Operador: ' + esc(e.operador) : '') + '<br>' +
      (prevH === null ? 'Primera carga registrada de esta máquina (sin carga anterior).' : 'Último horómetro cargado: <b class="mono">' + fnum(prevH, 1) + '</b>') + (e.teorico ? ' · Consumo teórico: <b class="mono">' + fnum(e.teorico, 2) + '</b> por unidad' : ' · <span class="pill warn">Sin consumo teórico</span>');
    if (h > 0 && l > 0) {
      var r = CC.previa(S.data, { fecha: $('#s_fecha').value, informe: '__', camion: $('#s_cam').value, codigo: e.codigo, horometro: h, litros: l });
      if (r.real !== null) t += '<br>Trabajó <b class="mono">' + fnum(r.uso, 1) + '</b> → consumo real <b class="mono">' + fnum(r.real, 2) + '</b>' + (r.desvio !== null ? ' (' + (r.desvio >= 0 ? '+' : '') + fnum(r.desvio * 100, 0) + '%) ' : ' ') + estPill(r) + (r.control === 'Revisar horómetro o litros' ? ' ' + pill('Revisá horómetro o litros', 'warn') : '');
      else if (prevH !== null && h <= prevH) t += '<br><span class="pill warn">El horómetro es menor o igual al último cargado</span>';
    }
    el.innerHTML = t;
  }
  function enviar(action, payload, ok) {
    if (S.busy) return; S.busy = true; S.msg = '';
    api(action, payload).then(function (j) { S.busy = false; return cargar(function () { render(); ok && ok(j); }); })
      .catch(function (e) { S.busy = false; S.msg = errTxt(e); render(); window.scrollTo(0, 0); });
  }
  function guardarSalida(ev) {
    ev.preventDefault();
    var e = resolverCodigo($('#s_cod').value), h = pnum($('#s_hor').value), l = pnum($('#s_lit').value);
    if (!e) { S.msg = 'Ese código de máquina no existe.'; return render(); }
    if (!(h > 0) || !(l > 0)) { S.msg = 'Revisá horómetro y litros.'; return render(); }
    var f = $('#s_fecha').value, cam = $('#s_cam').value; S.fecha = f; S.camion = cam;
    var chk = CC.previa(S.data, { fecha: f, informe: '__', camion: cam, codigo: e.codigo, horometro: h, litros: l });
    if (chk.control === 'Revisar horómetro o litros' && !confirm('El consumo da muy distinto al teórico. ¿Están bien el horómetro y los litros?')) return;
    enviar('addSalida', { rid: rid(), data: { fecha: f, informe: $('#s_inf').value.trim(), camion: cam, codigo: e.codigo, horometro: h, litros: l } }, function () { toast('Guardado: ' + e.codigo + ' · ' + fnum(l, 1) + ' L'); });
  }

  /* ----- Cierre ----- */
  function vCierre() {
    var d = S.data, lista = CC.cierres(d).slice().reverse().slice(0, 40);
    $('#vista').innerHTML = '<div class="stack"><div class="g2"><form class="card stack" id="fc"><div class="eyebrow">Cierre de la jornada</div>' +
      '<label class="f"><span>Fecha</span><input class="in mono" type="date" id="c_fecha" value="' + S.fecha + '" max="' + hoy() + '" required></label>' +
      '<label class="f"><span>Camión</span><select class="in" id="c_cam">' + camOpts(S.camion) + '</select></label>' +
      '<label class="f"><span>Taxilitro al final de la jornada</span><input class="in mono" id="c_tx" inputmode="decimal" required></label>' +
      '<label class="f"><span>Stock medido en el tanque (opcional)</span><input class="in mono" id="c_st" inputmode="decimal"></label>' +
      '<label class="f"><span>Observación (opcional)</span><input class="in" id="c_ob" maxlength="200"></label>' +
      '<button class="btn primary" type="submit">Guardar cierre</button></form>' +
      '<div class="card" id="c_ctl"></div></div>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Últimos cierres</div><div class="scroll">' + tablaCierres(lista) + '</div></div></div>';
  }
  function filaCierreCtl(c) {
    return '<div class="row"><span>Taxilitro inicial</span><b class="mono">' + fnum(c.inicial, 1) + '</b></div><div class="row"><span>Despachado según taxilitro</span><b class="mono">' + fnum(c.despachado, 1) + ' L</b></div>' +
      '<div class="row"><span>Suma de informes de salida del día</span><b class="mono">' + fnum(c.informes, 1) + ' L</b></div><div class="row"><span>Diferencia</span><b class="mono">' + (c.diferencia > 0 ? '+' : '') + fnum(c.diferencia, 1) + ' L</b></div>' +
      '<div style="margin:10px 0">' + (c.retrocede ? pill('El taxilitro es menor al anterior: revisá', 'crit') : c.cierra ? pill('CIERRA', 'ok') : pill('NO CIERRA · ' + (c.diferencia > 0 ? 'faltan respaldar ' : 'informes de más: ') + fnum(Math.abs(c.diferencia), 1) + ' L', 'crit')) + '</div>' +
      '<div class="row"><span>Entradas del día</span><b class="mono">' + fnum(c.entradasDia, 1) + ' L</b></div><div class="row"><span>Stock teórico al cierre</span><b class="mono">' + fnum(c.stockTeorico, 1) + ' L</b></div>' +
      '<div style="margin-top:10px">' + (c.difStock === null ? pill('Sin stock medido', '') : c.stockOk ? pill('Stock OK (dif. ' + fnum(c.difStock, 1) + ' L)', 'ok') : pill('REVISAR stock: dif. ' + fnum(c.difStock, 1) + ' L', 'crit')) + '</div>';
  }
  function actualizarCierre() {
    var el = $('#c_ctl'); if (!el) return;
    var tx = pnum($('#c_tx').value), f = $('#c_fecha').value, cam = $('#c_cam').value;
    if (tx === null) { el.innerHTML = '<div class="eyebrow">Control automático</div><p class="muted small">Ingresá el taxilitro final y te muestro si el día cierra.</p>'; return; }
    var st = pnum($('#c_st').value), d = S.data;
    var fake = { equipos: d.equipos, params: d.params, camiones: d.camiones, salidas: d.salidas, entradas: d.entradas,
      cierres: d.cierres.filter(function (c) { return !(c.estado === 'vigente' && c.fecha === f && c.camion === cam); }).concat([{ id: '__n', estado: 'vigente', fecha: f, camion: cam, taxilitro: tx, stock: st }]) };
    var r = CC.cierres(fake).filter(function (c) { return c.id === '__n'; })[0];
    el.innerHTML = '<div class="eyebrow">Control automático</div>' + filaCierreCtl(r);
  }
  function tablaCierres(rows) {
    if (!rows.length) return '<p class="muted small">Todavía no hay cierres cargados.</p>';
    return '<table class="tbl"><thead><tr><th>Fecha</th><th>Camión</th><th class="num">Taxilitro</th><th class="num">Despachado</th><th class="num">Informes</th><th class="num">Dif.</th><th>Cierre</th><th class="num">Stock teórico</th><th class="num">Stock medido</th><th></th></tr></thead><tbody>' +
      rows.map(function (c) { return '<tr><td>' + fdate(c.fecha) + '</td><td>' + esc(c.camion) + '</td><td class="num mono">' + fnum(c.taxilitro, 1) + '</td><td class="num mono">' + fnum(c.despachado, 1) + '</td><td class="num mono">' + fnum(c.informes, 1) + '</td><td class="num mono">' + fnum(c.diferencia, 1) + '</td><td>' + (c.cierra ? pill('CIERRA', 'ok') : pill('NO CIERRA', 'crit')) + '</td><td class="num mono">' + fnum(c.stockTeorico, 1) + '</td><td class="num mono">' + fnum(c.stock, 1) + '</td><td class="nowrap"><button class="link" data-a="fix" data-t="cierre" data-id="' + esc(c.id) + '">Corregir</button> <button class="link" data-a="anular" data-t="cierre" data-id="' + esc(c.id) + '">Anular</button></td></tr>'; }).join('') + '</tbody></table>';
  }
  function guardarCierre(ev) {
    ev.preventDefault(); var tx = pnum($('#c_tx').value); if (tx === null) { S.msg = 'Ingresá el taxilitro.'; return render(); }
    var st = $('#c_st').value.trim(); S.fecha = $('#c_fecha').value; S.camion = $('#c_cam').value;
    enviar('addCierre', { rid: rid(), data: { fecha: S.fecha, camion: S.camion, taxilitro: tx, stock: st === '' ? '' : pnum(st), obs: $('#c_ob').value } }, function () { toast('Cierre guardado'); });
  }

  /* ----- Entradas ----- */
  function vEntradas() {
    var lista = S.data.entradas.filter(function (e) { return e.estado === 'vigente'; }).slice().reverse().slice(0, 40);
    $('#vista').innerHTML = '<div class="stack"><form class="card stack" id="fe"><div class="eyebrow">Entrada de combustible al camión</div><div class="fgrid">' +
      '<label class="f"><span>Fecha</span><input class="in mono" type="date" id="e_fecha" value="' + S.fecha + '" max="' + hoy() + '" required></label>' +
      '<label class="f"><span>Camión</span><select class="in" id="e_cam">' + camOpts(S.camion) + '</select></label>' +
      '<label class="f"><span>N° de remito</span><input class="in mono" id="e_rem"></label>' +
      '<label class="f wide2"><span>Proveedor / origen</span><input class="in" id="e_prov"></label>' +
      '<label class="f"><span>Litros ingresados</span><input class="in mono" id="e_lit" inputmode="decimal" required></label>' +
      '<button class="btn primary" type="submit" style="min-height:56px">Guardar entrada</button></div></form>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Últimas entradas</div><div class="scroll">' +
      (lista.length ? '<table class="tbl"><thead><tr><th>Fecha</th><th>Camión</th><th>Remito</th><th>Proveedor</th><th class="num">Litros</th><th></th></tr></thead><tbody>' + lista.map(function (e) { return '<tr><td>' + fdate(e.fecha) + '</td><td>' + esc(e.camion) + '</td><td class="mono">' + esc(e.remito) + '</td><td>' + esc(e.proveedor) + '</td><td class="num mono">' + fnum(e.litros, 1) + '</td><td class="nowrap"><button class="link" data-a="fix" data-t="entrada" data-id="' + esc(e.id) + '">Corregir</button> <button class="link" data-a="anular" data-t="entrada" data-id="' + esc(e.id) + '">Anular</button></td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted small">Todavía no hay entradas cargadas.</p>') + '</div></div></div>';
  }
  function guardarEntrada(ev) {
    ev.preventDefault(); var l = pnum($('#e_lit').value); if (!(l > 0)) { S.msg = 'Ingresá los litros.'; return render(); }
    S.fecha = $('#e_fecha').value; S.camion = $('#e_cam').value;
    enviar('addEntrada', { rid: rid(), data: { fecha: S.fecha, camion: S.camion, remito: $('#e_rem').value, proveedor: $('#e_prov').value, litros: l } }, function () { toast('Entrada guardada'); });
  }

  /* ----- Excel ----- */
  /* ----- Reportes con filtros ----- */
  function filtros() { return { codigos: S.f.codigos, tipo: S.f.tipo, operador: S.f.operador, camion: S.f.camion, estado: S.f.estado, desvioMin: S.f.desvioMin }; }
  function setPreset(p) {
    var d = new Date(), y = d.getFullYear(), m = d.getMonth(), iso = function (x) { return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); };
    if (p === 'hoy') S.repD = S.repH = iso(d);
    else if (p === 'ayer') { d.setDate(d.getDate() - 1); S.repD = S.repH = iso(d); }
    else if (p === 'semana') { var w = new Date(d); w.setDate(d.getDate() - ((d.getDay() + 6) % 7)); S.repD = iso(w); S.repH = iso(new Date()); }
    else if (p === 'mes') { S.repD = iso(new Date(y, m, 1)); S.repH = iso(new Date()); }
    else if (p === 'mesant') { S.repD = iso(new Date(y, m - 1, 1)); S.repH = iso(new Date(y, m, 0)); }
    S.preset = p;
  }
  var ESTADOS = [['', 'Todos'], ['sobre', 'Solo sobreconsumo'], ['normal', 'Solo normales'], ['revisar', 'Cargas a revisar'], ['sinteorico', 'Sin consumo teórico'], ['primera', 'Primera carga (sin referencia)']];
  function ordenar(rows, id, defK, defDir, cols) {
    var o = S.sort[id] || { k: defK, dir: defDir }, col = cols.filter(function (c) { return c.k === o.k; })[0] || cols[0];
    return rows.slice().sort(function (a, b) { var x = col.v(a), y = col.v(b); if (x === null || x === undefined || x === '') return 1; if (y === null || y === undefined || y === '') return -1; return (x < y ? -1 : x > y ? 1 : 0) * (o.dir === 'asc' ? 1 : -1); });
  }
  function tablaOrd(id, cols, rows, defK, defDir, vacio) {
    if (!rows.length) return '<p class="muted small">' + vacio + '</p>';
    var o = S.sort[id] || { k: defK, dir: defDir }, sorted = ordenar(rows, id, defK, defDir, cols);
    return '<table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th class="' + (c.num ? 'num' : '') + '"><button class="sortb" data-a="sort" data-t="' + id + '" data-k="' + c.k + '">' + c.l + (o.k === c.k ? (o.dir === 'asc' ? ' ▲' : ' ▼') : '') + '</button></th>'; }).join('') + '</tr></thead><tbody>' +
      sorted.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td class="' + (c.num ? 'num mono' : '') + '">' + c.h(r) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function colsMaq() { return [
    { k: 'codigo', l: 'Máquina', v: function (m) { return m.codigo; }, h: function (m) { return '<b>' + esc(m.codigo) + '</b> <span class="muted small">' + esc(m.nombre) + '</span>'; } },
    { k: 'operador', l: 'Operador', v: function (m) { return m.operador; }, h: function (m) { return esc(m.operador); } },
    { k: 'cargas', l: 'Cargas', num: 1, v: function (m) { return m.cargas; }, h: function (m) { return m.cargas; } },
    { k: 'litros', l: 'Litros', num: 1, v: function (m) { return m.litros; }, h: function (m) { return fnum(m.litros, 1); } },
    { k: 'uso', l: 'Uso (h/km)', num: 1, v: function (m) { return m.uso; }, h: function (m) { return fnum(m.uso, 1); } },
    { k: 'real', l: 'Real', num: 1, v: function (m) { return m.real; }, h: function (m) { return fnum(m.real, 2); } },
    { k: 'teorico', l: 'Teórico', num: 1, v: function (m) { return m.teorico; }, h: function (m) { return fnum(m.teorico, 2); } },
    { k: 'desvio', l: 'Desvío', num: 1, v: function (m) { return m.desvio; }, h: function (m) { return m.desvio === null ? '—' : (m.desvio >= 0 ? '+' : '') + fnum(m.desvio * 100, 0) + '%'; } },
    { k: 'estado', l: 'Estado', v: function (m) { return m.estado; }, h: function (m) { return pill(m.estado, m.estado === 'SOBRECONSUMO' ? 'crit' : m.estado === 'Normal' ? 'ok' : m.estado === 'Sin teórico' ? 'warn' : ''); } }]; }
  function colsDet() { return [
    { k: 'fecha', l: 'Fecha', v: function (x) { return x.fecha; }, h: function (x) { return fdate(x.fecha); } },
    { k: 'informe', l: 'N°', v: function (x) { return Number(x.informe) || x.informe; }, h: function (x) { return esc(x.informe); } },
    { k: 'codigo', l: 'Máquina', v: function (x) { return x.codigo; }, h: function (x) { return '<b>' + esc(x.codigo) + '</b> <span class="muted small">' + esc(x.nombre) + '</span>'; } },
    { k: 'operador', l: 'Operador', v: function (x) { return x.operador; }, h: function (x) { return esc(x.operador); } },
    { k: 'horometro', l: 'Horóm.', num: 1, v: function (x) { return x.horometro; }, h: function (x) { return fnum(x.horometro, 1); } },
    { k: 'litros', l: 'Litros', num: 1, v: function (x) { return x.litros; }, h: function (x) { return fnum(x.litros, 1); } },
    { k: 'real', l: 'Consumo real', num: 1, v: function (x) { return x.real; }, h: function (x) { return fnum(x.real, 2); } },
    { k: 'desvio', l: 'Desvío', num: 1, v: function (x) { return x.desvio; }, h: function (x) { return x.desvio === null ? '—' : (x.desvio >= 0 ? '+' : '') + fnum(x.desvio * 100, 0) + '%'; } },
    { k: 'estadoCalc', l: 'Estado', v: function (x) { return x.estadoCalc; }, h: function (x) { return estPill(x); } },
    { k: 'control', l: 'Control', v: function (x) { return x.control; }, h: function (x) { return x.control === 'OK' ? pill('OK', 'ok') : pill(x.control, 'warn'); } }]; }
  function uniq(a) { var o = {}; a.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o).sort(); }
  function opt(list, sel, todos) { return '<option value="">' + todos + '</option>' + list.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
  function vReportes() {
    if (!S.repD) setPreset('mes');
    var d = S.data, f = S.f, r = CC.reporte(d, S.repD, S.repH, filtros()), s = r.resumen, rojo = function (n) { return n ? 'var(--crit)' : 'inherit'; };
    var activos = [];
    if (f.codigos.length) activos.push('Máquinas: ' + f.codigos.join(', ')); if (f.tipo) activos.push('Tipo: ' + f.tipo); if (f.operador) activos.push('Operador: ' + f.operador); if (f.camion) activos.push('Camión: ' + f.camion);
    if (f.estado) activos.push('Estado: ' + ESTADOS.filter(function (e) { return e[0] === f.estado; })[0][1]); if (f.desvioMin !== '') activos.push('Desvío desde +' + f.desvioMin + '%');
    var pre = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesant', 'Mes anterior']];
    var camTbl = CC.camiones(d).filter(function (c) { return !f.camion || c.camion === f.camion; }).map(function (c) { var u = c.ultimo;
      return '<tr><td><b>' + esc(c.camion) + '</b></td>' + (u ? '<td>' + fdate(u.fecha) + '</td><td class="num mono">' + fnum(u.taxilitro, 1) + '</td><td class="num mono">' + fnum(u.stockTeorico, 1) + '</td><td class="num mono">' + fnum(u.stock, 1) + '</td><td>' + (u.difStock === null ? pill('Sin medición', '') : u.stockOk ? pill('Stock OK', 'ok') : pill('REVISAR stock', 'crit')) + '</td>' : '<td colspan="5" class="muted">Sin cierres cargados</td>') + '</tr>'; }).join('');
    var dias = r.cierres.slice().reverse().map(function (c) { return '<tr><td>' + fdate(c.fecha) + '</td><td>' + esc(c.camion) + '</td><td class="num mono">' + fnum(c.despachado, 1) + '</td><td class="num mono">' + fnum(c.informes, 1) + '</td><td class="num mono">' + (c.diferencia > 0 ? '+' : '') + fnum(c.diferencia, 1) + '</td><td>' + (c.cierra ? pill('CIERRA', 'ok') : pill('NO CIERRA', 'crit')) + '</td></tr>'; }).join('');
    var sobre = r.maq.filter(function (m) { return m.estado === 'SOBRECONSUMO'; });
    $('#vista').innerHTML = '<div class="stack">' +
      '<div class="card stack"><div class="sec" style="margin:0"><div class="eyebrow">Filtros</div><button class="link" data-a="limpiar">Limpiar filtros</button></div>' +
      '<div class="chips">' + pre.map(function (p) { return '<button class="chip" data-a="preset" data-v="' + p[0] + '" aria-pressed="' + (S.preset === p[0]) + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<div class="fgrid"><label class="f"><span>Desde</span><input class="in mono" type="date" id="r_d" value="' + S.repD + '"></label><label class="f"><span>Hasta</span><input class="in mono" type="date" id="r_h" value="' + S.repH + '"></label>' +
      '<label class="f"><span>Tipo de equipo</span><select class="in" id="f_tipo">' + opt(uniq(d.equipos.map(function (e) { return e.tipo; })), f.tipo, 'Todos') + '</select></label>' +
      '<label class="f"><span>Operador</span><select class="in" id="f_operador">' + opt(uniq(d.equipos.map(function (e) { return e.operador; })), f.operador, 'Todos') + '</select></label>' +
      '<label class="f"><span>Camión</span><select class="in" id="f_camion">' + opt(d.camiones.map(function (c) { return c.camion; }), f.camion, 'Todos') + '</select></label>' +
      '<label class="f"><span>Estado</span><select class="in" id="f_estado">' + ESTADOS.map(function (e) { return '<option value="' + e[0] + '"' + (e[0] === f.estado ? ' selected' : '') + '>' + e[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Desvío mínimo (%)</span><input class="in mono" id="f_desvio" inputmode="decimal" placeholder="Ej.: 20" value="' + esc(f.desvioMin) + '"></label>' +
      '<label class="f wide2"><span>Máquina (agregá una o varias)</span><input class="in" id="f_cod" list="dl_rep" autocomplete="off" placeholder="Escribí el código y elegí"></label><datalist id="dl_rep">' + d.equipos.map(function (e) { return '<option value="' + esc(e.codigo) + '">' + esc(e.nombre) + '</option>'; }).join('') + '</datalist></div>' +
      (f.codigos.length ? '<div class="chips">' + f.codigos.map(function (c) { return '<button class="chip on" data-a="quitar" data-v="' + esc(c) + '">' + esc(c) + ' ✕</button>'; }).join('') + '</div>' : '') +
      '<div class="small muted">' + (activos.length ? 'Mostrando: ' + esc(activos.join(' · ')) : 'Sin filtros: se muestra todo el período.') + ' · ' + fdate(S.repD) + ' al ' + fdate(S.repH) + '</div>' +
      '<button class="btn primary" data-a="xlsx" style="min-height:52px">Descargar Excel con este filtro</button></div>' +
      '<div class="cbkpi"><div class="card"><span class="eyebrow">Litros cargados</span><b class="mono">' + fnum(s.litros, 0) + '</b></div><div class="card"><span class="eyebrow">Cargas</span><b class="mono">' + s.cargas + '</b></div><div class="card"><span class="eyebrow">Máquinas</span><b class="mono">' + s.maquinas + '</b></div>' +
      '<div class="card"><span class="eyebrow">Con sobreconsumo</span><b class="mono" style="color:' + rojo(s.sobreconsumo) + '">' + s.sobreconsumo + '</b></div><div class="card"><span class="eyebrow">Días que no cierran</span><b class="mono" style="color:' + rojo(s.diasNoCierran) + '">' + s.diasNoCierran + '</b></div>' +
      '<div class="card"><span class="eyebrow">Cargas sin cierre de taxilitro</span><b class="mono" style="color:' + rojo(s.sinCierre) + '">' + s.sinCierre + '</b></div><div class="card"><span class="eyebrow">Cargas a revisar</span><b class="mono" style="color:' + rojo(s.aRevisar) + '">' + s.aRevisar + '</b></div></div>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Camión lubricador: estado actual</div><div class="scroll"><table class="tbl"><thead><tr><th>Camión</th><th>Último cierre</th><th class="num">Taxilitro</th><th class="num">Stock teórico (L)</th><th class="num">Stock medido (L)</th><th>Control</th></tr></thead><tbody>' + camTbl + '</tbody></table></div></div>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Cierre diario: taxilitro vs informes <span class="muted" style="text-transform:none;letter-spacing:0">(no cambia con los filtros de máquina)</span></div><div class="scroll">' + (dias ? '<table class="tbl"><thead><tr><th>Fecha</th><th>Camión</th><th class="num">Despachado (L)</th><th class="num">Informes (L)</th><th class="num">Diferencia (L)</th><th>Cierre</th></tr></thead><tbody>' + dias + '</tbody></table>' : '<p class="muted small">No hay cierres en el período.</p>') + '</div></div>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Consumo por máquina (' + r.maq.length + ') <span class="muted" style="text-transform:none;letter-spacing:0">· tocá un título para ordenar</span></div><div class="scroll">' + tablaOrd('maq', colsMaq(), r.maq, 'desvio', 'desc', 'No hay cargas con estos filtros.') + '</div></div>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Detalle de cargas (' + r.rows.length + ')</div><div class="scroll">' + tablaOrd('det', colsDet(), r.rows, 'fecha', 'desc', 'No hay cargas con estos filtros.') + '</div></div></div>';
  }
  function filtroTxt() { var f = S.f, a = []; if (f.codigos.length) a.push('Máquinas ' + f.codigos.join(', ')); if (f.tipo) a.push('Tipo ' + f.tipo); if (f.operador) a.push('Operador ' + f.operador); if (f.camion) a.push('Camión ' + f.camion); if (f.estado) a.push('Estado ' + f.estado); if (f.desvioMin !== '') a.push('Desvío desde +' + f.desvioMin + '%'); return a.length ? a.join(' | ') : 'Sin filtros'; }
  function descargar() {
    if (!window.XLSX) { S.msg = 'No se pudo cargar la librería de Excel (¿sin internet?).'; return render(); }
    var r = CC.reporte(S.data, S.repD, S.repH, filtros()), X = XLSX, wb = X.utils.book_new(), s = r.resumen;
    function add(name, aoa, w) { var ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = w.map(function (x) { return { wch: x }; }); X.utils.book_append_sheet(wb, ws, name); }
    add('Resumen', [['REPORTE DE CONTROL DE COMBUSTIBLE'], ['Período', fdate(S.repD) + ' al ' + fdate(S.repH)], ['Generado por', S.user], ['Filtros', filtroTxt()], [],
      ['Litros cargados a máquinas', s.litros], ['Cantidad de cargas', s.cargas], ['Máquinas con SOBRECONSUMO', s.sobreconsumo], ['Días en que el taxilitro NO cierra', s.diasNoCierran], ['Cargas sin cierre de taxilitro', s.sinCierre], ['Cargas a revisar (informe repetido, horómetro/litros dudosos)', s.aRevisar], [],
      ['Las 10 máquinas con mayor sobreconsumo'], ['Código', 'Equipo', 'Operador', 'Consumo real', 'Consumo teórico', 'Desvío %']]
      .concat(r.maq.filter(function (m) { return m.estado === 'SOBRECONSUMO'; }).sort(function (a, b) { return b.desvio - a.desvio; }).slice(0, 10).map(function (m) { return [m.codigo, m.nombre, m.operador, rd(m.real, 2), m.teorico, rd(m.desvio * 100, 1) + '%']; })), [34, 40, 30, 14, 14, 10]);
    add('Consumo por máquina', [['Código', 'Equipo', 'Operador', 'Cargas', 'Litros cargados', 'Litros con medición', 'Uso medido (h o km)', 'Consumo real', 'Consumo teórico', 'Desvío %', 'Estado', 'Último horómetro', 'Última carga']]
      .concat(r.maq.map(function (m) { return [m.codigo, m.nombre, m.operador, m.cargas, rd(m.litros, 1), rd(m.litrosMed, 1), rd(m.uso, 1), rd(m.real, 2), m.teorico, m.desvio === null ? '' : rd(m.desvio * 100, 1) + '%', m.estado, m.ultimoHorometro, fdate(m.ultimaCarga)]; })), [14, 40, 30, 8, 14, 14, 14, 12, 12, 10, 20, 14, 12]);
    add('Camión lubricador', [['Fecha', 'Camión', 'Taxilitro inicial', 'Taxilitro final', 'Despachado (L)', 'Informes (L)', 'Diferencia (L)', 'Cierre', 'Entradas del día (L)', 'Stock teórico (L)', 'Stock medido (L)', 'Dif. stock (L)', 'Observación']]
      .concat(r.cierres.map(function (c) { return [fdate(c.fecha), c.camion, c.inicial, c.taxilitro, rd(c.despachado, 1), rd(c.informes, 1), rd(c.diferencia, 1), c.cierra ? 'CIERRA' : 'NO CIERRA', rd(c.entradasDia, 1), rd(c.stockTeorico, 1), c.stock, c.difStock === null ? '' : rd(c.difStock, 1), c.obs]; })), [12, 10, 14, 14, 14, 14, 14, 12, 16, 16, 16, 14, 30]);
    add('Salidas (detalle)', [['Fecha', 'N° informe', 'Camión', 'Código', 'Equipo', 'Operador', 'Horómetro', 'Litros', 'Horóm. anterior', 'Uso', 'Consumo real', 'Consumo teórico', 'Desvío %', 'Estado', 'Control', 'Cargado por']]
      .concat(r.rows.map(function (x) { return [fdate(x.fecha), x.informe, x.camion, x.codigo, x.nombre, x.operador, x.horometro, x.litros, x.prev, rd(x.uso, 1), rd(x.real, 2), x.teorico, x.desvio === null ? '' : rd(x.desvio * 100, 1) + '%', x.estadoCalc, x.control, x.creadoPor]; })), [12, 12, 10, 14, 34, 28, 12, 10, 14, 10, 12, 12, 10, 20, 26, 18]);
    X.writeFile(wb, 'Control_Combustible_' + S.repD + '_a_' + S.repH + '.xlsx');
  }
  function rd(n, d) { return n === null || n === undefined || isNaN(n) ? '' : Math.round(n * Math.pow(10, d)) / Math.pow(10, d); }

  /* ----- Corregir / anular ----- */
  function buscar(t, id) { var arr = t === 'salida' ? S.data.salidas : t === 'cierre' ? S.data.cierres : S.data.entradas; return arr.filter(function (o) { return o.id === id; })[0]; }
  function abrirFix(t, id) {
    var o = buscar(t, id); if (!o) return;
    var campos = t === 'salida' ? [['fecha', 'Fecha', 'date'], ['informe', 'N° informe', 'text'], ['camion', 'Camión', 'sel'], ['codigo', 'Código de máquina', 'text'], ['horometro', 'Horómetro / km', 'num'], ['litros', 'Litros', 'num']] :
      t === 'cierre' ? [['fecha', 'Fecha', 'date'], ['camion', 'Camión', 'sel'], ['taxilitro', 'Taxilitro final', 'num'], ['stock', 'Stock medido', 'num'], ['obs', 'Observación', 'text']] :
        [['fecha', 'Fecha', 'date'], ['camion', 'Camión', 'sel'], ['remito', 'N° de remito', 'text'], ['proveedor', 'Proveedor', 'text'], ['litros', 'Litros', 'num']];
    dlg.innerHTML = '<form method="dialog" class="stack" id="fx"><h2 style="font-size:1.25rem">Corregir ' + t + '</h2><p class="muted small">Se guarda una línea nueva y la original queda registrada como corregida (con tu nombre y la hora).</p>' +
      campos.map(function (c) { var v = o[c[0]]; return '<label class="f"><span>' + c[1] + '</span>' + (c[2] === 'sel' ? '<select class="in" name="' + c[0] + '">' + camOpts(v) + '</select>' : '<input class="in' + (c[2] === 'text' ? '' : ' mono') + '" name="' + c[0] + '" ' + (c[2] === 'date' ? 'type="date" max="' + hoy() + '"' : c[2] === 'num' ? 'inputmode="decimal"' : '') + ' value="' + esc(c[2] === 'num' && v !== null && v !== '' ? String(v).replace('.', ',') : v) + '">') + '</label>'; }).join('') +
      '<div id="fxerr" class="err hide"></div><div style="display:flex;gap:10px"><button class="btn" type="button" data-a="fxno">Cancelar</button><button class="btn primary" type="submit">Guardar corrección</button></div></form>';
    dlg.showModal();
    $('#fx').onsubmit = function (ev) {
      ev.preventDefault(); var f = new FormData($('#fx')), d = {};
      campos.forEach(function (c) { var v = f.get(c[0]); d[c[0]] = c[2] === 'num' ? (String(v).trim() === '' ? '' : pnum(v)) : String(v).trim(); });
      if (t === 'salida') { var e = resolverCodigo(d.codigo); if (!e) return fxErr('Ese código de máquina no existe.'); d.codigo = e.codigo; }
      api('fix', { tipo: t, id: id, rid: rid(), modo: 'corregir', data: d }).then(function () { dlg.close(); toast('Corrección guardada'); cargar(); }).catch(function (e2) { fxErr(errTxt(e2)); });
    };
  }
  function fxErr(m) { var e = $('#fxerr'); e.textContent = m; e.classList.remove('hide'); }
  function anular(t, id) {
    var o = buscar(t, id); if (!o) return;
    if (!confirm('¿Anular este registro' + (o.informe ? ' (informe ' + o.informe + ')' : '') + '? Queda guardado como anulado, con tu nombre y la hora.')) return;
    api('fix', { tipo: t, id: id, rid: rid(), modo: 'anular' }).then(function () { toast('Anulado'); cargar(); }).catch(function (e) { S.msg = errTxt(e); render(); });
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-a]'); if (!b) return; var a = b.dataset.a;
    if (a === 'salir') { salir(); }
    else if (a === 'tab') { S.tab = b.dataset.v; S.msg = ''; render(); }
    else if (a === 'fix') abrirFix(b.dataset.t, b.dataset.id);
    else if (a === 'anular') anular(b.dataset.t, b.dataset.id);
    else if (a === 'fxno') dlg.close();
    else if (a === 'otra') { S.step = 'cedula'; S.msg = ''; S.ced = null; render(); }
    else if (a === 'xlsx') descargar();
    else if (a === 'preset') { setPreset(b.dataset.v); vReportes(); }
    else if (a === 'limpiar') { S.f = { codigos: [], tipo: '', operador: '', camion: '', estado: '', desvioMin: '' }; S.sort = {}; setPreset('mes'); vReportes(); }
    else if (a === 'quitar') { S.f.codigos = S.f.codigos.filter(function (c) { return c !== b.dataset.v; }); vReportes(); }
    else if (a === 'sort') { var o = S.sort[b.dataset.t] || {}; S.sort[b.dataset.t] = { k: b.dataset.k, dir: o.k === b.dataset.k && o.dir === 'desc' ? 'asc' : 'desc' }; vReportes(); }
  });
  document.addEventListener('submit', function (ev) {
    var id = ev.target.id;
    if (id === 'lf') { ev.preventDefault(); S.msg = '';
      if (S.step === 'cedula') { var c = $('#lc').value.replace(/\D/g, ''); if (!c) { S.msg = 'Ingresá tu cédula.'; return render(); } S.ced = c; lastCed = c;
        app.innerHTML = '<p class="muted">Verificando…</p>';
        api('check').then(function (j) { S.nombre = j.nombre; S.step = j.estado; S.msg = ''; render(); }).catch(function (e) { S.msg = errTxt(e); S.ced = null; S.step = 'cedula'; render(); }); return; }
      var p = $('#lp').value; if (S.step === 'crear' && p !== $('#lp2').value) { S.msg = 'Las contraseñas no coinciden.'; return render(); }
      S.pass = p; app.innerHTML = '<p class="muted">Entrando…</p>';
      api(S.step === 'crear' ? 'crearClave' : 'login').then(function (j) { S.user = j.user; S.puedeCargar = !!j.puedeCargar; S.tab = S.puedeCargar ? 'salidas' : 'reportes';
        try { sessionStorage.setItem('cb_user', S.user); sessionStorage.setItem('cb_ced', S.ced); sessionStorage.setItem('cb_pass', S.pass); localStorage.setItem('cb_lastCed', S.ced); } catch (e) {} cargar(); })
        .catch(function (e) { S.msg = errTxt(e); S.pass = null; render(); }); }
    else if (id === 'fs') guardarSalida(ev); else if (id === 'fc') guardarCierre(ev); else if (id === 'fe') guardarEntrada(ev);
  });
  document.addEventListener('input', function (ev) {
    var id = ev.target.id || '';
    if (/^s_/.test(id)) actualizarPrevia(); else if (/^c_/.test(id)) actualizarCierre();
  });
  function later(fn) { setTimeout(fn, 0); }
  document.addEventListener('change', function (ev) {
    var id = ev.target.id || '';
    if (id === 'r_d' || id === 'r_h') { S.repD = $('#r_d').value || S.repD; S.repH = $('#r_h').value || S.repH; S.preset = ''; later(vReportes); }
    else if (/^f_(tipo|operador|camion|estado)$/.test(id)) { S.f[id.slice(2)] = ev.target.value; later(vReportes); }
    else if (id === 'f_desvio') { S.f.desvioMin = ev.target.value.replace(',', '.').trim(); later(vReportes); }
    else if (id === 'f_cod') { var e = resolverCodigo(ev.target.value); if (e && S.f.codigos.indexOf(e.codigo) < 0) S.f.codigos.push(e.codigo); later(function () { vReportes(); var el = $('#f_cod'); if (el) el.focus(); }); }
    else if (id === 's_fecha') { S.fecha = ev.target.value; later(vSalidas); }
    else if (/^s_|^c_/.test(id)) { if (id === 's_cam' || id === 'c_cam') S.camion = ev.target.value; id[0] === 's' ? actualizarPrevia() : actualizarCierre(); }
  });

  window.__COMB__ = { S: S, render: render };
  if (S.user && S.ced && S.pass) cargar(); else render();
})();
