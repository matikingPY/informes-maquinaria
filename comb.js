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
      '<div class="acciones"><button class="btn primary" data-a="xlsx" style="min-height:52px">Descargar Excel con este filtro</button><button class="btn" data-a="print" style="min-height:52px">Imprimir / guardar PDF</button><button class="btn" data-a="imagen" style="min-height:52px">Compartir como imagen</button></div></div>' +
      '<div class="cbkpi"><div class="card"><span class="eyebrow">Litros cargados</span><b class="mono">' + fnum(s.litros, 0) + '</b></div><div class="card"><span class="eyebrow">Cargas</span><b class="mono">' + s.cargas + '</b></div><div class="card"><span class="eyebrow">Máquinas</span><b class="mono">' + s.maquinas + '</b></div>' +
      '<div class="card"><span class="eyebrow">Con sobreconsumo</span><b class="mono" style="color:' + rojo(s.sobreconsumo) + '">' + s.sobreconsumo + '</b></div><div class="card"><span class="eyebrow">Días que no cierran</span><b class="mono" style="color:' + rojo(s.diasNoCierran) + '">' + s.diasNoCierran + '</b></div>' +
      '<div class="card"><span class="eyebrow">Cargas sin cierre de taxilitro</span><b class="mono" style="color:' + rojo(s.sinCierre) + '">' + s.sinCierre + '</b></div><div class="card"><span class="eyebrow">Cargas a revisar</span><b class="mono" style="color:' + rojo(s.aRevisar) + '">' + s.aRevisar + '</b></div></div>' +
      '<div class="g2w">' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Camión lubricador: estado actual</div><div class="scroll"><table class="tbl"><thead><tr><th>Camión</th><th>Último cierre</th><th class="num">Taxilitro</th><th class="num">Stock teórico (L)</th><th class="num">Stock medido (L)</th><th>Control</th></tr></thead><tbody>' + camTbl + '</tbody></table></div></div>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Cierre diario: taxilitro vs informes <span class="muted" style="text-transform:none;letter-spacing:0">(no cambia con los filtros de máquina)</span></div><div class="scroll">' + (dias ? '<table class="tbl"><thead><tr><th>Fecha</th><th>Camión</th><th class="num">Despachado (L)</th><th class="num">Informes (L)</th><th class="num">Diferencia (L)</th><th>Cierre</th></tr></thead><tbody>' + dias + '</tbody></table>' : '<p class="muted small">No hay cierres en el período.</p>') + '</div></div>' +
      '</div>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Consumo por máquina (' + r.maq.length + ') <span class="muted" style="text-transform:none;letter-spacing:0">· tocá un título para ordenar</span></div><div class="scroll">' + tablaOrd('maq', colsMaq(), r.maq, 'desvio', 'desc', 'No hay cargas con estos filtros.') + '</div></div>' +
      '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Detalle de cargas (' + r.rows.length + ')</div><div class="scroll">' + tablaOrd('det', colsDet(), r.rows, 'fecha', 'desc', 'No hay cargas con estos filtros.') + '</div></div></div>';
  }
  function filtroTxt() { var f = S.f, a = []; if (f.codigos.length) a.push('Máquinas ' + f.codigos.join(', ')); if (f.tipo) a.push('Tipo ' + f.tipo); if (f.operador) a.push('Operador ' + f.operador); if (f.camion) a.push('Camión ' + f.camion); if (f.estado) a.push('Estado ' + ESTADOS.filter(function (e) { return e[0] === f.estado; })[0][1]); if (f.desvioMin !== '') a.push('Desvío desde +' + f.desvioMin + '%'); return a.length ? a.join(' | ') : 'Sin filtros'; }
  function ahora() { var d = new Date(); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function tolTxt() { var t = S.data.params.tolSobreconsumo; return fnum((t == null ? 0.15 : t) * 100, 0) + '%'; }
  var NOTA = 'Cómo se calcula: el consumo real de una máquina es los litros de la carga dividido las horas (o km) trabajadas desde su carga anterior, asumiendo que cada carga llena el tanque; la primera carga de una máquina no se evalúa. Es SOBRECONSUMO si supera al consumo teórico en más de la tolerancia. El día "cierra" si la diferencia entre el taxilitro y los informes de salida es menor o igual a la tolerancia.';

  /* ---------- Excel con formato de presentación (ExcelJS) ---------- */
  function descargar() {
    if (!window.ExcelJS) { S.msg = 'No se pudo cargar la librería de Excel (¿sin internet?).'; return render(); }
    var r = CC.reporte(S.data, S.repD, S.repH, filtros()), s = r.resumen, EJ = window.ExcelJS, wb = new EJ.Workbook();
    wb.creator = 'WheelCo'; wb.created = new Date();
    var NEG = 'FF1F1F1F', ROJO = 'FFD31F16', GRIS = 'FFF3F3F3', BORDE = 'FFBFBFBF';
    var thin = { style: 'thin', color: { argb: BORDE } };
    var FILL = { crit: 'FFFBE0DD', ok: 'FFDDF3E6', warn: 'FFFCEBC9' }, TXT = { crit: 'FF9C1C14', ok: 'FF11663A', warn: 'FF7A4A00' };
    function estCls(t) { return t === 'SOBRECONSUMO' || t === 'NO CIERRA' || t === 'REVISAR' || t === 'Código inválido' ? 'crit' : (t === 'Normal' || t === 'CIERRA' || t === 'OK') ? 'ok' : (t === 'Sin teórico' || t === 'Sin datos suficientes' || (t && t !== 'Sin cargas' && t !== '1ª carga (sin ref.)' && t !== 'Sin medición')) ? 'warn' : ''; }
    function hoja(nombre, titulo, ncols, orient) {
      var ws = wb.addWorksheet(nombre, { views: [{ showGridLines: false }] });
      ws.pageSetup = { paperSize: 9, orientation: orient || 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
      ws.headerFooter.oddFooter = '&L&8WheelCo · Control de combustible&C&8Página &P de &N&R&8Impreso: &D';
      var last = ncols;
      ws.mergeCells(1, 3, 1, last); ws.mergeCells(2, 3, 2, last); ws.mergeCells(3, 3, 3, last);
      var c1 = ws.getCell(1, 3); c1.value = titulo; c1.font = { name: 'Arial', size: 16, bold: true, color: { argb: NEG } }; c1.alignment = { vertical: 'middle' };
      var c2 = ws.getCell(2, 3); c2.value = 'Período: ' + fdate(S.repD) + ' al ' + fdate(S.repH) + '   ·   ' + filtroTxt(); c2.font = { name: 'Arial', size: 10, color: { argb: 'FF454545' } }; c2.alignment = { vertical: 'middle', wrapText: true };
      var c3 = ws.getCell(3, 3); c3.value = 'Generado por ' + S.user + ' el ' + ahora(); c3.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF666666' } }; c3.alignment = { vertical: 'middle' };
      ws.getRow(1).height = 30; ws.getRow(2).height = 22; ws.getRow(3).height = 18; ws.getRow(4).height = 4;
      for (var j = 1; j <= last; j++) ws.getCell(4, j).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO } };
      if (logoId !== null) ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 118, height: 47 } });
      return ws;
    }
    /* tabla: cols = [{h:'Título', w:ancho, k:fn(fila), f:'formato', c:'center'|'right', e:true si pinta estado}] */
    function tabla(ws, fila0, cols, rows, opt) {
      opt = opt || {};
      cols.forEach(function (c, i) { var col = ws.getColumn(i + 1); if (!col.width || col.width < c.w) col.width = c.w; });
      var hr = ws.getRow(fila0); hr.height = 30;
      cols.forEach(function (c, i) { var x = hr.getCell(i + 1); x.value = c.h; x.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NEG } }; x.alignment = { vertical: 'middle', horizontal: c.f || c.c ? 'center' : 'left', wrapText: true }; x.border = { top: thin, bottom: thin, left: thin, right: thin }; });
      rows.forEach(function (row, ri) {
        var rr = ws.getRow(fila0 + 1 + ri); rr.height = 18;
        cols.forEach(function (c, i) {
          var x = rr.getCell(i + 1), v = c.k(row); x.value = (v === undefined || v === null || v === '' || (typeof v === 'number' && isNaN(v))) ? null : v;
          x.font = { name: 'Arial', size: 9, bold: !!c.b }; x.border = { top: thin, bottom: thin, left: thin, right: thin };
          x.alignment = { vertical: 'middle', horizontal: c.c || (c.f ? 'right' : 'left'), wrapText: false };
          if (c.f) x.numFmt = c.f;
          if (ri % 2 === 1) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
          if (c.e && x.value !== null) { var cl = estCls(String(x.value)); if (cl) { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[cl] } }; x.font = { name: 'Arial', size: 9, bold: true, color: { argb: TXT[cl] } }; x.alignment = { vertical: 'middle', horizontal: 'center' }; } }
          if (c.neg && typeof x.value === 'number' && x.value > 0 && c.neg === 'pos') x.font = { name: 'Arial', size: 9, bold: true, color: { argb: TXT.crit } };
        });
      });
      if (!rows.length) { var e = ws.getRow(fila0 + 1).getCell(1); e.value = 'Sin datos para este período y filtros.'; e.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF666666' } }; }
      return fila0 + 1 + Math.max(rows.length, 1);
    }
    function seccion(ws, fila, texto, ncols) { ws.mergeCells(fila, 1, fila, ncols); var x = ws.getCell(fila, 1); x.value = texto; x.font = { name: 'Arial', size: 11, bold: true, color: { argb: ROJO } }; x.alignment = { vertical: 'middle' }; ws.getRow(fila).height = 22; return fila + 1; }
    function nota(ws, fila, ncols, texto) { ws.mergeCells(fila, 1, fila, ncols); var x = ws.getCell(fila, 1); x.value = texto; x.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF666666' } }; x.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(fila).height = 48; }
    var logoId = null;

    function armar() {
      /* 1) Resumen */
      var w1 = hoja('Resumen', 'Reporte de control de combustible', 8, 'portrait'), f = 6;
      f = seccion(w1, f, 'Indicadores del período', 8);
      var kp = [['Litros cargados a máquinas', s.litros, '#,##0'], ['Cantidad de cargas', s.cargas, '#,##0'], ['Máquinas incluidas', s.maquinas, '0'], ['Máquinas con SOBRECONSUMO (tolerancia ' + tolTxt() + ')', s.sobreconsumo, '0', 1], ['Días en que el taxilitro NO cierra con los informes', s.diasNoCierran, '0', 1], ['Cargas cuyo día no tiene cierre de taxilitro', s.sinCierre, '0', 1], ['Cargas a revisar (informe repetido, horómetro o litros dudosos)', s.aRevisar, '0', 1]];
      kp.forEach(function (k, i) { var r1 = w1.getRow(f + i); w1.mergeCells(f + i, 1, f + i, 6); var a1 = r1.getCell(1), b1 = r1.getCell(7); a1.value = k[0]; a1.font = { name: 'Arial', size: 10 }; b1.value = k[1]; b1.numFmt = k[2]; b1.font = { name: 'Arial', size: 11, bold: true, color: { argb: k[3] && k[1] > 0 ? TXT.crit : NEG } }; b1.alignment = { horizontal: 'right' }; if (k[3] && k[1] > 0) b1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.crit } }; for (var j = 1; j <= 7; j++) r1.getCell(j).border = { bottom: thin }; r1.height = 20; });
      f += kp.length + 1;
      f = seccion(w1, f, 'Camión lubricador: estado actual', 8);
      var cam = CC.camiones(S.data).filter(function (c) { return !S.f.camion || c.camion === S.f.camion; });
      f = tabla(w1, f, [{ h: 'Camión', w: 12, k: function (c) { return c.camion; }, b: 1 }, { h: 'Último cierre', w: 14, k: function (c) { return c.ultimo ? fdate(c.ultimo.fecha) : 'Sin cierres'; }, c: 'center' }, { h: 'Taxilitro', w: 14, k: function (c) { return c.ultimo ? c.ultimo.taxilitro : null; }, f: '#,##0.0' }, { h: 'Stock teórico (L)', w: 16, k: function (c) { return c.ultimo ? c.ultimo.stockTeorico : null; }, f: '#,##0.0' }, { h: 'Stock medido (L)', w: 16, k: function (c) { return c.ultimo ? c.ultimo.stock : null; }, f: '#,##0.0' }, { h: 'Control de stock', w: 16, e: 1, k: function (c) { var u = c.ultimo; return !u ? '' : u.difStock === null ? 'Sin medición' : u.stockOk ? 'OK' : 'REVISAR'; } }], cam) + 1;
      f = seccion(w1, f, 'Máquinas con sobreconsumo', 8);
      var sob = r.maq.filter(function (m) { return m.estado === 'SOBRECONSUMO'; }).sort(function (a, b) { return b.desvio - a.desvio; });
      f = tabla(w1, f, [{ h: 'Código', w: 12, k: function (m) { return m.codigo; }, b: 1 }, { h: 'Equipo', w: 30, k: function (m) { return m.nombre; } }, { h: 'Operador', w: 28, k: function (m) { return m.operador; } }, { h: 'Consumo real', w: 14, f: '#,##0.00', k: function (m) { return rd(m.real, 2); } }, { h: 'Teórico', w: 12, f: '#,##0.00', k: function (m) { return m.teorico; } }, { h: 'Desvío', w: 12, f: '+0.0%;-0.0%;0.0%', neg: 'pos', k: function (m) { return m.desvio; } }], sob) + 1;
      nota(w1, f, 8, NOTA);
      w1.getColumn(7).width = 14; w1.getColumn(8).width = 4;

      /* 2) Consumo por máquina */
      var w2 = hoja('Consumo por máquina', 'Consumo por máquina', 13), maq = r.maq.slice().sort(function (a, b) { return (b.desvio === null ? -9 : b.desvio) - (a.desvio === null ? -9 : a.desvio); });
      var fin2 = tabla(w2, 6, [{ h: 'Código', w: 13, b: 1, k: function (m) { return m.codigo; } }, { h: 'Equipo', w: 34, k: function (m) { return m.nombre; } }, { h: 'Operador', w: 28, k: function (m) { return m.operador; } }, { h: 'Cargas', w: 9, f: '0', k: function (m) { return m.cargas; } }, { h: 'Litros cargados', w: 13, f: '#,##0.0', k: function (m) { return rd(m.litros, 1); } }, { h: 'Litros con medición', w: 13, f: '#,##0.0', k: function (m) { return rd(m.litrosMed, 1); } }, { h: 'Uso medido (h o km)', w: 13, f: '#,##0.0', k: function (m) { return rd(m.uso, 1); } }, { h: 'Consumo real', w: 12, f: '#,##0.00', k: function (m) { return rd(m.real, 2); } }, { h: 'Consumo teórico', w: 12, f: '#,##0.00', k: function (m) { return m.teorico; } }, { h: 'Desvío', w: 10, f: '+0.0%;-0.0%;0.0%', neg: 'pos', k: function (m) { return m.desvio; } }, { h: 'Estado', w: 20, e: 1, k: function (m) { return m.estado; } }, { h: 'Último horómetro', w: 13, f: '#,##0.0', k: function (m) { return m.ultimoHorometro; } }, { h: 'Última carga', w: 12, c: 'center', k: function (m) { return fdate(m.ultimaCarga); } }], maq);
      var tr = w2.getRow(fin2); w2.mergeCells(fin2, 1, fin2, 3); tr.getCell(1).value = 'TOTAL'; tr.getCell(4).value = s.cargas; tr.getCell(5).value = rd(s.litros, 1);
      for (var j = 1; j <= 13; j++) { var tx = tr.getCell(j); tx.font = { name: 'Arial', size: 9, bold: true }; tx.border = { top: { style: 'medium', color: { argb: NEG } } }; if (j >= 4 && j <= 7) tx.numFmt = j === 4 ? '0' : '#,##0.0'; }
      w2.views = [{ showGridLines: false, state: 'frozen', ySplit: 6 }]; w2.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: 13 } }; w2.pageSetup.printTitlesRow = '6:6';

      /* 3) Cierre del camión */
      var w3 = hoja('Cierre del camión', 'Camión lubricador: cierre diario (taxilitro vs informes)', 13);
      tabla(w3, 6, [{ h: 'Fecha', w: 12, c: 'center', k: function (c) { return fdate(c.fecha); } }, { h: 'Camión', w: 11, b: 1, k: function (c) { return c.camion; } }, { h: 'Taxilitro inicial', w: 14, f: '#,##0.0', k: function (c) { return c.inicial; } }, { h: 'Taxilitro final', w: 14, f: '#,##0.0', k: function (c) { return c.taxilitro; } }, { h: 'Despachado según taxilitro (L)', w: 16, f: '#,##0.0', k: function (c) { return rd(c.despachado, 1); } }, { h: 'Salidas según informes (L)', w: 16, f: '#,##0.0', k: function (c) { return rd(c.informes, 1); } }, { h: 'Diferencia (L)', w: 13, f: '#,##0.0;-#,##0.0;0.0', k: function (c) { return rd(c.diferencia, 1); } }, { h: 'Cierre del día', w: 14, e: 1, k: function (c) { return c.cierra ? 'CIERRA' : 'NO CIERRA'; } }, { h: 'Entradas del día (L)', w: 13, f: '#,##0.0', k: function (c) { return rd(c.entradasDia, 1); } }, { h: 'Stock teórico (L)', w: 14, f: '#,##0.0', k: function (c) { return rd(c.stockTeorico, 1); } }, { h: 'Stock medido (L)', w: 14, f: '#,##0.0', k: function (c) { return c.stock; } }, { h: 'Dif. stock (L)', w: 13, f: '#,##0.0;-#,##0.0;0.0', k: function (c) { return c.difStock === null ? null : rd(c.difStock, 1); } }, { h: 'Observación', w: 30, k: function (c) { return c.obs; } }], r.cierres);
      w3.views = [{ showGridLines: false, state: 'frozen', ySplit: 6 }]; w3.pageSetup.printTitlesRow = '6:6';

      /* 4) Detalle */
      var w4 = hoja('Detalle de cargas', 'Detalle de cargas (informes de salida)', 16), det = r.rows.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (Number(a.informe) || 0) - (Number(b.informe) || 0); });
      tabla(w4, 6, [{ h: 'Fecha', w: 12, c: 'center', k: function (x) { return fdate(x.fecha); } }, { h: 'N° informe', w: 11, c: 'center', k: function (x) { return x.informe; } }, { h: 'Camión', w: 10, k: function (x) { return x.camion; } }, { h: 'Código', w: 12, b: 1, k: function (x) { return x.codigo; } }, { h: 'Equipo', w: 30, k: function (x) { return x.nombre; } }, { h: 'Operador', w: 26, k: function (x) { return x.operador; } }, { h: 'Horómetro / km', w: 12, f: '#,##0.0', k: function (x) { return x.horometro; } }, { h: 'Litros', w: 10, f: '#,##0.0', k: function (x) { return x.litros; } }, { h: 'Horóm. anterior', w: 12, f: '#,##0.0', k: function (x) { return x.prev; } }, { h: 'Uso', w: 9, f: '#,##0.0', k: function (x) { return rd(x.uso, 1); } }, { h: 'Consumo real', w: 11, f: '#,##0.00', k: function (x) { return rd(x.real, 2); } }, { h: 'Consumo teórico', w: 11, f: '#,##0.00', k: function (x) { return x.teorico; } }, { h: 'Desvío', w: 9, f: '+0.0%;-0.0%;0.0%', neg: 'pos', k: function (x) { return x.desvio; } }, { h: 'Estado', w: 19, e: 1, k: function (x) { return x.estadoCalc; } }, { h: 'Control', w: 24, e: 1, k: function (x) { return x.control; } }, { h: 'Cargado por', w: 22, k: function (x) { return x.creadoPor; } }], det);
      w4.views = [{ showGridLines: false, state: 'frozen', ySplit: 6 }]; w4.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: 16 } }; w4.pageSetup.printTitlesRow = '6:6';

      return wb.xlsx.writeBuffer().then(function (buf) {
        var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'Control_Combustible_' + S.repD + '_a_' + S.repH + '.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        toast('Excel descargado');
      });
    }
    toast('Preparando Excel…');
    fetch('icons/logo.png').then(function (x) { return x.ok ? x.arrayBuffer() : null; }).catch(function () { return null; }).then(function (ab) {
      if (ab) { var bin = '', u8 = new Uint8Array(ab); for (var i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); try { logoId = wb.addImage({ base64: btoa(bin), extension: 'png' }); } catch (e) { logoId = null; } }
      return armar();
    }).catch(function (e) { S.msg = 'No se pudo armar el Excel: ' + (e && e.message ? e.message : e); render(); });
  }

  /* ---------- Imprimir / guardar como PDF ---------- */
  function imprimir() {
    var r = CC.reporte(S.data, S.repD, S.repH, filtros()), s = r.resumen, d = S.data;
    function th(a) { return '<tr>' + a.map(function (x) { return '<th' + (x[1] ? ' class="nm"' : '') + '>' + x[0] + '</th>'; }).join('') + '</tr>'; }
    function tag(t) { var c = t === 'SOBRECONSUMO' || t === 'NO CIERRA' || t === 'REVISAR' || t === 'Código inválido' ? 'c' : (t === 'Normal' || t === 'CIERRA' || t === 'OK') ? 'o' : (t === 'Sin teórico' || t === 'Sin datos suficientes' || /revisar|repetido|Falta|Faltan/i.test(t)) ? 'w' : ''; return '<span class="etq ' + c + '">' + esc(t) + '</span>'; }
    var cam = CC.camiones(d).filter(function (c) { return !S.f.camion || c.camion === S.f.camion; });
    var maq = r.maq.slice().sort(function (a, b) { return (b.desvio === null ? -9 : b.desvio) - (a.desvio === null ? -9 : a.desvio); });
    var det = r.rows.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (Number(a.informe) || 0) - (Number(b.informe) || 0); });
    var h = '<div class="ph"><picture><source media="(prefers-color-scheme: dark)" srcset="icons/logo.png"><img src="icons/logo.png" alt="WheelCo"></picture><div><h1>Reporte de control de combustible</h1><p>Período: <b>' + fdate(S.repD) + ' al ' + fdate(S.repH) + '</b> · ' + esc(filtroTxt()) + '</p><p class="g">Generado por ' + esc(S.user) + ' el ' + ahora() + '</p></div></div>' +
      '<h2>Indicadores</h2><div class="pk">' + [['Litros cargados', fnum(s.litros, 0), 0], ['Cargas', s.cargas, 0], ['Máquinas', s.maquinas, 0], ['Con sobreconsumo', s.sobreconsumo, s.sobreconsumo], ['Días que no cierran', s.diasNoCierran, s.diasNoCierran], ['Cargas sin cierre de taxilitro', s.sinCierre, s.sinCierre], ['Cargas a revisar', s.aRevisar, s.aRevisar]].map(function (k) { return '<div class="' + (k[2] ? 'al' : '') + '"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>'; }).join('') + '</div>' +
      '<h2>Camión lubricador: estado actual</h2><table>' + th([['Camión'], ['Último cierre'], ['Taxilitro', 1], ['Stock teórico (L)', 1], ['Stock medido (L)', 1], ['Control']]) + cam.map(function (c) { var u = c.ultimo; return '<tr><td><b>' + esc(c.camion) + '</b></td>' + (u ? '<td>' + fdate(u.fecha) + '</td><td class="nm">' + fnum(u.taxilitro, 1) + '</td><td class="nm">' + fnum(u.stockTeorico, 1) + '</td><td class="nm">' + fnum(u.stock, 1) + '</td><td>' + tag(u.difStock === null ? 'Sin medición' : u.stockOk ? 'OK' : 'REVISAR') + '</td>' : '<td colspan="5">Sin cierres cargados</td>') + '</tr>'; }).join('') + '</table>' +
      '<h2>Cierre diario: taxilitro vs informes</h2>' + (r.cierres.length ? '<table>' + th([['Fecha'], ['Camión'], ['Despachado (L)', 1], ['Informes (L)', 1], ['Diferencia (L)', 1], ['Entradas (L)', 1], ['Cierre']]) + r.cierres.map(function (c) { return '<tr><td>' + fdate(c.fecha) + '</td><td>' + esc(c.camion) + '</td><td class="nm">' + fnum(c.despachado, 1) + '</td><td class="nm">' + fnum(c.informes, 1) + '</td><td class="nm">' + (c.diferencia > 0 ? '+' : '') + fnum(c.diferencia, 1) + '</td><td class="nm">' + fnum(c.entradasDia, 1) + '</td><td>' + tag(c.cierra ? 'CIERRA' : 'NO CIERRA') + '</td></tr>'; }).join('') + '</table>' : '<p class="g">No hay cierres en el período.</p>') +
      '<h2>Consumo por máquina (' + maq.length + ')</h2>' + (maq.length ? '<table>' + th([['Máquina'], ['Operador'], ['Cargas', 1], ['Litros', 1], ['Uso (h/km)', 1], ['Real', 1], ['Teórico', 1], ['Desvío', 1], ['Estado']]) + maq.map(function (m) { return '<tr><td><b>' + esc(m.codigo) + '</b> ' + esc(m.nombre) + '</td><td>' + esc(m.operador) + '</td><td class="nm">' + m.cargas + '</td><td class="nm">' + fnum(m.litros, 1) + '</td><td class="nm">' + fnum(m.uso, 1) + '</td><td class="nm">' + fnum(m.real, 2) + '</td><td class="nm">' + fnum(m.teorico, 2) + '</td><td class="nm">' + (m.desvio === null ? '—' : (m.desvio >= 0 ? '+' : '') + fnum(m.desvio * 100, 0) + '%') + '</td><td>' + tag(m.estado) + '</td></tr>'; }).join('') + '</table>' : '<p class="g">No hay cargas con estos filtros.</p>') +
      '<h2 class="pb">Detalle de cargas (' + det.length + ')</h2>' + (det.length ? '<table>' + th([['Fecha'], ['N°'], ['Máquina'], ['Operador'], ['Horóm.', 1], ['Litros', 1], ['Real', 1], ['Desvío', 1], ['Estado'], ['Control']]) + det.map(function (x) { return '<tr><td>' + fdate(x.fecha) + '</td><td>' + esc(x.informe) + '</td><td><b>' + esc(x.codigo) + '</b></td><td>' + esc(x.operador) + '</td><td class="nm">' + fnum(x.horometro, 1) + '</td><td class="nm">' + fnum(x.litros, 1) + '</td><td class="nm">' + fnum(x.real, 2) + '</td><td class="nm">' + (x.desvio === null ? '—' : (x.desvio >= 0 ? '+' : '') + fnum(x.desvio * 100, 0) + '%') + '</td><td>' + tag(x.estadoCalc) + '</td><td>' + tag(x.control) + '</td></tr>'; }).join('') + '</table>' : '<p class="g">No hay cargas con estos filtros.</p>') +
      '<p class="nt">' + esc(NOTA) + ' Tolerancia de sobreconsumo vigente: ' + tolTxt() + '.</p>';
    var el = $('#printrep'); if (!el) { el = document.createElement('div'); el.id = 'printrep'; document.body.appendChild(el); }
    el.innerHTML = h; setTimeout(function () { window.print(); }, 150);
  }


  /* ---------- Compartir como imagen (resumen para WhatsApp, etc.) ---------- */
  function compartirImagen() {
    var r = CC.reporte(S.data, S.repD, S.repH, filtros()), s = r.resumen, W = 1080, P = 48;
    var sob = r.maq.filter(function (m) { return m.estado === 'SOBRECONSUMO'; }).sort(function (a, b) { return b.desvio - a.desvio; }).slice(0, 10);
    var noc = r.cierres.filter(function (c) { return !c.cierra; }).slice(-5).reverse();
    var cam = CC.camiones(S.data).filter(function (c) { return !S.f.camion || c.camion === S.f.camion; });
    var H = 150 + 40 + 230 + 60 + cam.length * 44 + 70 + (sob.length ? sob.length * 46 + 60 : 70) + (noc.length ? noc.length * 40 + 70 : 0) + 110;
    var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'), F = 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
    function txt(t, px, py, size, w, col, al, maxw) { x.font = (w || 400) + ' ' + size + 'px ' + F; x.fillStyle = col || '#0e0e0e'; x.textAlign = al || 'left'; var v = String(t); if (maxw) { while (x.measureText(v).width > maxw && v.length > 3) v = v.slice(0, -2); if (v !== String(t)) v += '…'; } x.fillText(v, px, py); }
    function rect(rx, ry, rw, rh, fill, rad, stroke) { x.beginPath(); if (x.roundRect) x.roundRect(rx, ry, rw, rh, rad || 0); else x.rect(rx, ry, rw, rh); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = 2; x.stroke(); } }
    function dibujar(logo) {
      rect(0, 0, W, H, '#ffffff'); rect(0, 0, W, 8, '#d31f16');
      var y = 40; if (logo && logo.width) { var lw = 190, lh = logo.height * lw / logo.width; x.drawImage(logo, P, y, lw, lh); }
      txt('Control de combustible', W - P, y + 34, 30, 800, '#0e0e0e', 'right'); txt(fdate(S.repD) + ' al ' + fdate(S.repH), W - P, y + 68, 24, 500, '#454545', 'right');
      y = 150; var ft = filtroTxt(); if (ft !== 'Sin filtros') { txt('Filtros: ' + ft, P, y, 20, 500, '#666', 'left', W - 2 * P); }
      y += 24;
      var kp = [['Litros cargados', fnum(s.litros, 0), 0], ['Cargas', String(s.cargas), 0], ['Máquinas', String(s.maquinas), 0], ['Con sobreconsumo', String(s.sobreconsumo), s.sobreconsumo], ['Días que no cierran', String(s.diasNoCierran), s.diasNoCierran], ['Cargas sin cierre', String(s.sinCierre), s.sinCierre], ['Cargas a revisar', String(s.aRevisar), s.aRevisar]];
      var cw = (W - 2 * P - 3 * 16) / 4;
      kp.forEach(function (k, i) { var cx = P + (i % 4) * (cw + 16), cy = y + Math.floor(i / 4) * 112; rect(cx, cy, cw, 96, k[2] ? '#fbe0dd' : '#f2f2f2', 16); txt(k[0].toUpperCase(), cx + 16, cy + 30, 15, 700, '#666', 'left', cw - 24); txt(k[1], cx + 16, cy + 76, 42, 800, k[2] ? '#9c1c14' : '#0e0e0e', 'left', cw - 24); });
      y += 230 + 20;
      txt('CAMIÓN LUBRICADOR', P, y, 18, 800, '#d31f16'); y += 14;
      cam.forEach(function (cm) { var u = cm.ultimo; rect(P, y, W - 2 * P, 38, '#f7f7f7', 10); txt(cm.camion, P + 14, y + 26, 22, 800); if (u) { var st = u.difStock === null ? 'sin medición de stock' : (u.stockOk ? 'stock OK' : 'REVISAR stock'); txt('Último cierre ' + fdate(u.fecha) + ' · Stock teórico ' + fnum(u.stockTeorico, 0) + ' L · ' + st, W - P - 14, y + 26, 20, 500, u.difStock !== null && !u.stockOk ? '#9c1c14' : '#333', 'right', 780); } else txt('Sin cierres cargados', W - P - 14, y + 26, 20, 500, '#666', 'right'); y += 44; });
      y += 30; txt('MÁQUINAS CON SOBRECONSUMO', P, y, 18, 800, '#d31f16'); y += 14;
      if (!sob.length) { txt('Ninguna máquina supera la tolerancia (' + tolTxt() + ') en este período.', P, y + 30, 22, 500, '#11663a'); y += 60; }
      else { txt('Real / Teórico', W - P - 130, y + 22, 16, 700, '#666', 'right'); txt('Desvío', W - P, y + 22, 16, 700, '#666', 'right'); y += 30;
        sob.forEach(function (m, i) { rect(P, y, W - 2 * P, 42, i % 2 ? '#ffffff' : '#f7f7f7', 8); txt(m.codigo, P + 14, y + 29, 22, 800); txt(m.nombre + (m.operador ? ' · ' + m.operador : ''), P + 150, y + 29, 19, 400, '#333', 'left', 480); txt(fnum(m.real, 1) + ' / ' + fnum(m.teorico, 1), W - P - 130, y + 29, 20, 600, '#0e0e0e', 'right'); txt('+' + fnum(m.desvio * 100, 0) + '%', W - P - 14, y + 29, 22, 800, '#9c1c14', 'right'); y += 46; }); }
      if (noc.length) { y += 24; txt('DÍAS QUE NO CIERRAN', P, y, 18, 800, '#d31f16'); y += 12; noc.forEach(function (cc) { rect(P, y, W - 2 * P, 34, '#fbe0dd', 8); txt(fdate(cc.fecha) + ' · ' + cc.camion, P + 14, y + 24, 20, 700, '#9c1c14'); txt('Taxilitro ' + fnum(cc.despachado, 0) + ' L vs informes ' + fnum(cc.informes, 0) + ' L (' + (cc.diferencia > 0 ? '+' : '') + fnum(cc.diferencia, 0) + ' L)', W - P - 14, y + 24, 19, 500, '#333', 'right'); y += 40; }); }
      txt('Generado por ' + S.user + ' · ' + ahora() + ' · WheelCo', W / 2, y + 50, 17, 500, '#8a8a8a', 'center');
      return y + 80;
    }
    function recorte(yf) { var c2 = document.createElement('canvas'); c2.width = W; c2.height = Math.min(H, Math.max(300, yf)); c2.getContext('2d').drawImage(c, 0, 0); c = c2; }
    var im = new Image(); im.onload = function () { recorte(dibujar(im)); salida(); }; im.onerror = function () { recorte(dibujar(null)); salida(); }; im.src = 'icons/logo.png';
    function salida() {
      c.toBlob(function (blob) {
        var nombre = 'Resumen_Combustible_' + S.repD + '_a_' + S.repH + '.png', file = null;
        try { file = new File([blob], nombre, { type: 'image/png' }); } catch (e) {}
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Control de combustible' }).catch(function () {}); return; }
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast('Imagen descargada');
        window.__ULTIMA_IMG__ = { w: c.width, h: c.height, url: c.toDataURL('image/png') };
      }, 'image/png');
    }
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
    else if (a === 'print') imprimir();
    else if (a === 'imagen') compartirImagen();
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
