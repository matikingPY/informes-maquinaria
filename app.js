(function () {
'use strict';
var CFG = window.APP_CONFIG || {};
var SAL = ':ied1';
var ITEMS = [['limpieza','Limpieza y desbroce'],['destape','Destape de cantera'],['bolsones','Exc. de bolsones'],['exc_nc','Exc. no clasificada'],['zanja','Exc. zanja de drenaje'],['carga_prest','Carga de mat. en préstamo'],['carga_cant','Carga de mat. en cantera'],['carga_plant','Carga de mat. en plantas'],['limp_prest','Limpieza p/ préstamo'],['acopio','Trabajo en acopio'],['cantera','Trabajo en cantera'],['esp_terr','Esparcida de mat. (terraplén)'],['esp_bolson','Esparcida de mat. (exc. bolsón)'],['esp_nc','Esparcida de mat. (exc. no clasif.)'],['taludes','Arreglo de taludes'],['cachamba','Limpieza de cachamba'],['otros','Otros']];
var ITEM_N = {}; ITEMS.forEach(function (i) { ITEM_N[i[0]] = i[1]; }); // nombres de los trabajos del formato anterior (informes viejos)
var GEN = { id: 'GEN', inf: '', name: 'Trabajo general', items: [] };
var app = document.getElementById('app'), topEl = document.getElementById('top'), toastEl = document.getElementById('toast');
var LS = 'ied.v1', toastT = null, renderT = null, pending = false, installEv = null;

var saved = (function () { try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch (e) { return {}; } })();
// solo se conservan los operadores que ya entraron en este celular (no hay lista completa)
var knownDocs = saved.known || {};
var keepOps = {}; Object.keys(knownDocs).forEach(function (k) { keepOps[knownDocs[k]] = 1; }); if (saved.session && saved.session.opId) keepOps[saved.session.opId] = 1;
var localOps = {}; Object.keys(saved.operators || {}).forEach(function (id) { if (keepOps[id]) localOps[id] = saved.operators[id]; });
function newLogin(role) { return { role: role || 'op', step: 'doc', doc: '', opId: null, pin: '', first: null, err: '', busy: false }; }
var S = {
  machines: saved.machines || {}, catalog: saved.catalog || { works: [], items: {} }, operators: localOps, known: knownDocs, shift: saved.shift || 9, myReqs: saved.myReqs || [], myReqsDate: saved.myReqsDate || '',
  queue: saved.queue || [], failed: saved.failed || [], session: null, pendingSession: null, view: 'login', tab: 'panel',
  login: newLogin('op'), form: null, last: null, f: null, sup: null, supLoading: false,
  reqPick: null, reqNote: '', showMiss: false, ex: { mode: 'maq', q: '', inf: 'all', tipo: 'all', open: null, shown: 15, sort: { maq: ['hours', -1], item: ['h', -1], op: ['hours', -1], av: ['date', -1] } }, hist: { opId: (saved.hist && saved.hist.opId) || '', list: (saved.hist && saved.hist.list) || [], at: (saved.hist && saved.hist.at) || '', range: '30', shown: 20, open: null, loading: false, err: '' }, boot: 'wait', net: { syncing: false, lastErr: '' }
};
if (saved.session && saved.session.opId && S.operators[saved.session.opId]) {
  if (CFG.REQUIRE_PIN_ON_OPEN) { S.pendingSession = saved.session; S.login.opId = saved.session.opId; S.login.step = 'pin'; }
  else { S.session = saved.session; S.view = 'opHome'; }
}

function save() {
  try {
    localStorage.setItem(LS, JSON.stringify({ machines: S.machines, catalog: S.catalog, operators: S.operators, known: S.known, shift: S.shift, session: S.session && S.session.role === 'op' ? S.session : (S.pendingSession || null), myReqs: S.myReqs, myReqsDate: S.myReqsDate, queue: S.queue, failed: S.failed, hist: { opId: S.hist.opId, list: S.hist.list, at: S.hist.at } }));
  } catch (e) {}
}

/* ---------- utilidades ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function fmt(n, d) { if (d == null) d = 1; return Number(n).toLocaleString('es-PY', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function gs(n) { return '₲ ' + Math.round(n).toLocaleString('es-PY'); }
function r1(n) { return Math.round(n * 10) / 10; }
function parseNum(v) { v = String(v == null ? '' : v).trim().replace(/\s/g, ''); if (!v) return NaN; var c = v.indexOf(','), d = v.indexOf('.'); if (c > -1 && d > -1) v = v.replace(/\./g, '').replace(',', '.'); else if (c > -1) v = v.replace(',', '.'); return parseFloat(v); }
function dfull(s) { var p = s.split('-'), t = new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); }
function normDoc(v) { return String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }
function fmtDoc(v) { return /^\d+$/.test(v) ? v.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : v; }
function today() { return new Date().toLocaleDateString('sv-SE'); }
function addDays(s, n) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2] + n).toLocaleDateString('sv-SE'); }
function dmy(s) { var p = s.split('-'); return p[2] + '/' + p[1]; }
function dlong(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: '2-digit' }); }
function dfullY(s) { return dfull(s) + ' ' + s.slice(0, 4); }
function comprobante(id) { var x = String(id || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8); return x.length > 4 ? x.slice(0, 4) + '-' + x.slice(4) : x; }
function fmtRec(v) {
  if (!v) return ''; var d = new Date(v); if (isNaN(d.getTime())) return String(v);
  var f = d.toLocaleDateString('es-PY', { day: 'numeric', month: 'long' }), hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  return f + ', ' + hh;
}
function arr(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
function machines() { return arr(S.machines).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); }
function operators() { return arr(S.operators).sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); }); }
function mcode(id) { return S.machines[id] ? S.machines[id].code : '—'; }
function toast(m) { toastEl.textContent = m; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 4500); }
function uid() { var u = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2)); return u.replace(/[^A-Za-z0-9_-]/g, ''); }
function sha(s) {
  if (!(window.crypto && crypto.subtle)) return Promise.reject({ error: 'no_crypto' });
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  });
}
/* íconos por tipo de máquina (dibujo simple; body = color principal, acc = rojo, hole = contraste) */
function mKind(m) {
  var t = (String(m && m.type || '') + ' ' + String(m && m.code || '')).toLowerCase();
  if (/motonivel|\bmn-/.test(t)) return 'mn'; if (/exc|\bex-/.test(t)) return 'ex'; if (/top|\btp-/.test(t)) return 'tp';
  if (/tractor|\bta-/.test(t)) return 'ta'; if (/vibro|compact|\bvc-/.test(t)) return 'vc'; return 'gen';
}
var DARKM = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
if (DARKM && DARKM.addEventListener) DARKM.addEventListener('change', function () { if (typeof render === 'function') render(); });
var ICON = {
  ex: '<rect x="6" y="46" width="60" height="13" rx="6.5" fill="B"/><circle cx="14" cy="52.5" r="3.2" fill="H"/><circle cx="37" cy="52.5" r="3.2" fill="H"/><circle cx="58" cy="52.5" r="3.2" fill="H"/><rect x="14" y="31" width="42" height="14" rx="3" fill="B"/><path d="M18 31V19a2 2 0 0 1 2-2h14l8 14z" fill="A"/><path d="M23 29V21h9l5 8z" fill="H" opacity=".5"/><path d="M46 35L66 11l8 5" stroke="B" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M72 14l10 22" stroke="B" stroke-width="4" stroke-linecap="round"/><path d="M77 34h13l-3 13h-10z" fill="A"/>',
  tp: '<rect x="10" y="45" width="66" height="14" rx="7" fill="B"/><circle cx="19" cy="52" r="3.4" fill="H"/><circle cx="43" cy="52" r="3.4" fill="H"/><circle cx="67" cy="52" r="3.4" fill="H"/><rect x="22" y="31" width="46" height="14" rx="3" fill="B"/><path d="M30 31V16a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v15z" fill="A"/><path d="M34 28V19h12v9z" fill="H" opacity=".5"/><rect x="14" y="10" width="3" height="8" fill="B"/><path d="M68 44l16 4" stroke="B" stroke-width="4" stroke-linecap="round"/><path d="M84 28h6l2 28h-6z" fill="A"/>',
  mn: '<path d="M10 40h60" stroke="B" stroke-width="5" stroke-linecap="round"/><rect x="52" y="34" width="34" height="10" rx="3" fill="B"/><path d="M56 34V17a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v17z" fill="A"/><path d="M61 31V20h12v11z" fill="H" opacity=".5"/><circle cx="16" cy="48" r="10" fill="B"/><circle cx="16" cy="48" r="4" fill="H"/><circle cx="62" cy="50" r="9" fill="B"/><circle cx="62" cy="50" r="3.5" fill="H"/><circle cx="80" cy="50" r="9" fill="B"/><circle cx="80" cy="50" r="3.5" fill="H"/><path d="M34 42l4 10" stroke="B" stroke-width="3.5" stroke-linecap="round"/><rect x="26" y="52" width="26" height="5" rx="2" fill="A"/>',
  ta: '<path d="M44 34h34a3 3 0 0 1 3 3v9H44z" fill="B"/><path d="M26 34V17a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v17z" fill="A"/><path d="M30 31V20h10v11z" fill="H" opacity=".5"/><rect x="22" y="31" width="30" height="8" rx="2" fill="B"/><rect x="74" y="20" width="3" height="14" fill="B"/><circle cx="30" cy="46" r="16" fill="B"/><circle cx="30" cy="46" r="7" fill="H"/><circle cx="30" cy="46" r="3" fill="A"/><circle cx="74" cy="52" r="9" fill="B"/><circle cx="74" cy="52" r="3.5" fill="H"/>',
  vc: '<rect x="30" y="31" width="52" height="15" rx="3" fill="B"/><path d="M48 31V15a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16z" fill="A"/><path d="M53 28V18h10v10z" fill="H" opacity=".5"/><circle cx="22" cy="46" r="15" fill="B"/><circle cx="22" cy="46" r="6" fill="H"/><path d="M12 38l20 16M10 46h24M12 54l20-16" stroke="H" stroke-width="1.6" opacity=".5"/><circle cx="72" cy="52" r="9" fill="B"/><circle cx="72" cy="52" r="3.5" fill="H"/><path d="M32 40l-8 6" stroke="B" stroke-width="4" stroke-linecap="round"/>',
  gen: '<circle cx="48" cy="34" r="22" fill="A"/><circle cx="48" cy="34" r="14" fill="B"/><circle cx="48" cy="34" r="5" fill="H"/>'
};
function mIcon(m, dark, w) {
  var osc = DARKM && DARKM.matches, body = dark ? '#ffffff' : (osc ? '#f2f2f2' : '#0e0e0e'), hole = dark ? (osc ? '#2c2c2c' : '#0e0e0e') : (osc ? '#1e1e1e' : '#ffffff'), g = ICON[mKind(m)].replace(/"B"/g, '"' + body + '"').replace(/"H"/g, '"' + hole + '"').replace(/"A"/g, '"#d31f16"');
  return '<svg class="micon" width="' + w + '" height="' + Math.round(w * 2 / 3) + '" viewBox="0 0 96 64" aria-hidden="true">' + g + '</svg>';
}
var ERR = {
  forbidden: 'La clave de la app no coincide con la planilla. Avisale al administrador.', not_configured: 'La app todavía no está conectada a la planilla.',
  bad_pin: 'PIN incorrecto', locked: 'Demasiados intentos. Esperá 10 minutos.', no_pin: 'Todavía no tenés PIN.', pin_exists: 'Ese operador ya tiene PIN. Pedile al supervisor que lo restablezca.',
  unknown_operator: 'Ese operador no está habilitado.', unknown_doc: 'No encontramos ese documento. Revisalo o avisale a tu supervisor.', unknown_machine: 'La máquina ya no está habilitada', bad_hours: 'Horómetros inválidos', bad_items: 'Las horas por trabajo no coinciden',
  bad_date: 'Fecha inválida', bad_prog: 'Progresivas inválidas', bad_nov: 'La novedad no es válida', bad_fuel: 'Datos de combustible inválidos', bad_id: 'Identificador inválido', no_crypto: 'Abrí la app desde su dirección https.', own_machine: 'Esa ya es tu máquina.'
};
function errMsg(e) { if (e && e.offline) return 'Sin señal'; return ERR[e && e.error] || ('Error del servidor' + (e && e.error ? ' (' + e.error + ')' : '')); }

/* ---------- servidor ---------- */
var SEGURAS = { identify: 1, bootstrap: 1, sync: 1, supData: 1, myReports: 1 }; // se pueden repetir sin riesgo
function api(action, payload) {
  var p = api1(action, payload);
  if (!SEGURAS[action]) return p;
  return p.catch(function (e) { if (e && e.offline) return api1(action, payload); throw e; }); // si falla la conexión, reintenta una vez
}
function api1(action, payload) {
  if (!CFG.API_URL || !CFG.API_KEY) return Promise.reject({ offline: false, error: 'not_configured' });
  var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 40000);
  return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key: CFG.API_KEY, action: action }, payload || {})), signal: ctl.signal, redirect: 'follow' })
    .then(function (r) { clearTimeout(t); return r.json().catch(function () { throw { offline: true, error: 'bad_response' }; }); },
      function () { clearTimeout(t); throw { offline: true, error: 'network' }; })
    .then(function (j) { if (!j.ok) throw { offline: false, error: j.error, message: j.message }; return j; });
}
function applyMachines(list) {
  var o = {}; list.forEach(function (m) { o[m.id] = m; });
  S.queue.forEach(function (q) { var m = o[q.r.machineId]; if (m && q.r.hFin > m.horo) m.horo = q.r.hFin; });
  S.machines = o;
}
function applyCatalog(c) { if (c && c.works && c.items) S.catalog = c; }
function applyBootstrap(res) {
  applyMachines(res.machines); applyCatalog(res.catalog); S.shift = res.shiftHours || 9;
}
function applySync(res) {
  applyMachines(res.machines); applyCatalog(res.catalog); S.myReqs = res.requests || []; S.myReqsDate = res.serverDate || today();
  var o = S.operators[res.operator.id]; if (o) { o.machineId = res.operator.machineId; o.name = res.operator.name || o.name; o.hasPin = true; }
}
function refreshBootstrap() {
  return api('bootstrap').then(function (res) { applyBootstrap(res); S.boot = 'ok'; save(); soft(); })
    .catch(function (e) { S.boot = e && e.offline ? 'offline' : (e && e.error) || 'error'; soft(); });
}
function mineQueue() { return S.queue.filter(function (q) { return S.session && q.opId === S.session.opId; }); }
function mineFailed() { return S.failed.filter(function (q) { return S.session && q.opId === S.session.opId; }); }
function syncNow() {
  if (!S.session || S.session.role !== 'op' || S.net.syncing) return Promise.resolve();
  var send = mineQueue().slice(0, 30);
  S.net.syncing = true;
  return api('sync', { opId: S.session.opId, pin: S.session.pinH, reports: send.map(function (q) { return q.r; }) }).then(function (res) {
    var by = {}; res.results.forEach(function (r) { by[r.id] = r; });
    send.forEach(function (q) {
      var r = by[q.r.id]; if (!r) return;
      S.queue = S.queue.filter(function (x) { return x !== q; });
      if (!r.ok) S.failed.push({ opId: q.opId, r: q.r, error: r.error });
    });
    applySync(res); S.net.lastErr = ''; S.net.syncing = false; save();
    if (send.length && mineQueue().length) return syncNow();
  }).catch(function (e) {
    S.net.syncing = false;
    if (e && e.offline) S.net.lastErr = 'offline';
    else if (e && (e.error === 'bad_pin' || e.error === 'unknown_operator' || e.error === 'no_pin')) authLost(e);
    else S.net.lastErr = (e && e.error) || 'error';
  }).then(function () { soft(); });
}
function authLost(e) {
  var id = S.session && S.session.opId;
  S.session = null; S.pendingSession = null; save();
  S.login = newLogin('op'); S.login.err = e && e.error === 'bad_pin' ? 'Tu PIN cambió. Entrá de nuevo.' : errMsg(e);
  S.view = 'login'; if (id && S.operators[id]) { S.login.opId = id; S.login.step = 'pin'; }
}

/* ---------- pantallas ---------- */
function netPill() {
  var off = (typeof navigator.onLine === 'boolean' && !navigator.onLine) || S.net.lastErr === 'offline', n = S.session && S.session.role === 'op' ? mineQueue().length : 0, h = '';
  if (off) h += '<span class="pill warn"><i class="dot"></i>Sin señal</span>';
  if (n) h += '<span class="pill info">' + n + ' sin enviar</span>';
  return h ? '<span class="net">' + h + '</span>' : '';
}
function header() {
  var who = '';
  if (S.session && S.session.role === 'op') { var o = S.operators[S.session.opId]; who = '<div class="who">' + netPill() + '<b>' + esc(o ? o.name : '') + '</b><button class="link" data-act="logout">Salir</button></div>'; }
  if (S.session && S.session.role === 'sup') who = '<div class="who"><b>Supervisor</b><button class="link" data-act="logout">Salir</button></div>';
  return '<div class="topin"><picture><source media="(prefers-color-scheme: dark)" srcset="icons/logo-dark.png"><img class="logo" src="icons/logo.png" alt="WheelCo"></picture>' + who + '</div>';
}
function render() {
  app.className = 'wrap' + (S.view === 'sup' ? ' wide' : ''); topEl.className = S.view === 'sup' ? 'wide' : '';
  var body = '';
  if (!CFG.API_URL || !CFG.API_KEY) body = '<div class="callout warn">La app todavía no está conectada a la planilla. Falta completar el archivo config.js (ver la guía de instalación).</div>';
  else if (S.view === 'login') body = loginView();
  else if (S.view === 'opHome') body = opHome();
  else if (S.view === 'form') body = formHTML();
  else if (S.view === 'otra') body = otraView();
  else if (S.view === 'done') body = doneView();
  else if (S.view === 'hist') body = histView();
  else if (S.view === 'sup') body = supView();
  topEl.innerHTML = header(); app.innerHTML = body;
  if (S.view === 'form') liveUpdate();
}
function go(v) { S.view = v; window.scrollTo(0, 0); render(); }
function soft() {
  if (renderT) return;
  renderT = requestAnimationFrame(function () {
    renderT = null;
    if (S.view === 'form') return;
    var a = document.activeElement;
    if (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { pending = true; return; }
    render();
  });
}
app.addEventListener('focusout', function () { if (pending) { pending = false; setTimeout(function () { if (S.view !== 'form') render(); }, 60); } });

/* login */
function padHTML(extra) {
  var h = '<div class="pad' + (S.login.busy ? ' loading' : '') + '">';
  '123456789'.split('').forEach(function (n) { h += '<button data-act="key" data-k="' + n + '">' + n + '</button>'; });
  return h + extra + '</div>';
}
function loginView() {
  var L = S.login, h = '<div class="stack login">';
  if ((L.role === 'op' && L.step === 'doc') || L.role === 'sup') h += '<div class="tabs2"><button data-act="role" data-r="op" aria-pressed="' + (L.role === 'op') + '">Soy operador</button><button data-act="role" data-r="sup" aria-pressed="' + (L.role === 'sup') + '">Supervisor</button></div>';
  if (L.role === 'op' && L.step === 'doc') {
    h += '<h1 class="big" style="text-align:center">Tu número de cédula</h1>';
    h += '<div class="docbox" aria-live="polite">' + (L.doc ? esc(fmtDoc(L.doc)) : '<span class="muted">Escribilo acá</span>') + '</div>';
    h += '<div class="err">' + (L.busy ? '<span class="muted">Buscando…</span>' : esc(L.err)) + '</div>';
    h += padHTML('<span></span><button data-act="key" data-k="0">0</button><button data-act="key" data-k="del" aria-label="Borrar">⌫</button>');
    h += '<button class="btn primary" data-act="docGo"' + (L.doc.length < 4 || L.busy ? ' disabled' : '') + '>Continuar</button>';
    if (installEv) h += '<button class="link" data-act="install" style="align-self:center">Instalar la app en este celular</button>';
  } else {
    var title, sub = '';
    if (L.role === 'sup') title = 'PIN de supervisor';
    else {
      var op = S.operators[L.opId];
      if (!op) { L.step = 'doc'; L.opId = null; return loginView(); }
      if (!op.hasPin && !(S.pendingSession && S.pendingSession.opId === op.id)) { title = L.first ? 'Repetí tu PIN' : 'Creá tu PIN'; sub = op.name + '. Elegí 4 números que recuerdes. Lo vas a usar siempre para entrar.'; }
      else { title = 'Hola, ' + op.name.split(' ')[0]; sub = 'Ingresá tu PIN.'; }
    }
    var d = ''; for (var i = 0; i < 4; i++) d += '<i class="' + (i < L.pin.length ? 'on' : '') + '"></i>';
    h += '<div style="text-align:center"><h1 class="big">' + esc(title) + '</h1>' + (sub ? '<p class="muted" style="margin:6px 0 0">' + esc(sub) + '</p>' : '') + '</div>';
    h += '<div class="dots" aria-label="' + L.pin.length + ' de 4 dígitos">' + d + '</div><div class="err">' + (L.busy ? '<span class="muted">Verificando…</span>' : esc(L.err)) + '</div>';
    h += padHTML('<button class="ghost" data-act="back" aria-label="Volver">' + (L.role === 'op' ? 'No soy yo' : 'Volver') + '</button><button data-act="key" data-k="0">0</button><button data-act="key" data-k="del" aria-label="Borrar">⌫</button>');
  }
  return h + '</div>';
}
function keyPress(k) {
  var L = S.login; if (L.busy) return; L.err = '';
  if (L.role === 'op' && L.step === 'doc') { if (k === 'del') L.doc = L.doc.slice(0, -1); else if (L.doc.length < 12) L.doc += k; render(); return; }
  if (k === 'del') L.pin = L.pin.slice(0, -1); else if (L.pin.length < 4) L.pin += k;
  render(); if (L.pin.length === 4) setTimeout(pinDone, 140);
}
function loginFail(msg) { var L = S.login; L.busy = false; L.err = msg; L.pin = ''; render(); }
function docDone() {
  var L = S.login, doc = normDoc(L.doc); if (L.busy || doc.length < 4) return;
  L.busy = true; L.err = ''; render();
  api('identify', { doc: doc }).then(function (res) {
    applyMachines(res.machines); applyCatalog(res.catalog); S.shift = res.shiftHours || 9;
    var op = res.operator, old = S.operators[op.id] || {};
    S.operators[op.id] = Object.assign({}, old, { id: op.id, name: op.name, machineId: op.machineId, hasPin: op.hasPin });
    S.known[doc] = op.id; save();
    L.opId = op.id; L.step = 'pin'; L.pin = ''; L.first = null; L.busy = false; render();
  }).catch(function (e) {
    L.busy = false;
    if (e && e.offline) {
      var id = S.known[doc];
      if (id && S.operators[id]) { L.opId = id; L.step = 'pin'; L.pin = ''; L.first = null; render(); return; }
      L.err = 'No pudimos conectar. Revisá tu señal y tocá Continuar otra vez.';
    } else L.err = errMsg(e);
    render();
  });
}
function pinDone() {
  var L = S.login;
  if (L.role === 'sup') { supLogin(L.pin); return; }
  var op = S.operators[L.opId]; if (!op) return;
  L.busy = true; render();
  sha(op.id + ':' + L.pin + SAL).then(function (h) {
    if (S.pendingSession && S.pendingSession.opId === op.id && S.pendingSession.pinH === h) { var s = S.pendingSession; S.pendingSession = null; enterAs(op.id, h); return; }
    if (!op.hasPin) {
      if (!L.first) { L.first = L.pin; L.pin = ''; L.busy = false; render(); return; }
      if (L.first !== L.pin) { L.first = null; loginFail('Los PIN no coinciden. Empezá de nuevo.'); return; }
      return api('setPin', { opId: op.id, newPin: h }).then(function () { op.hasPin = true; return api('sync', { opId: op.id, pin: h, reports: [] }); })
        .then(function (res) { applySync(res); enterAs(op.id, h); })
        .catch(function (e) { L.first = null; if (e && e.error === 'pin_exists') { op.hasPin = true; save(); } loginFail(errMsg(e) === 'Sin señal' ? 'Necesitás señal para crear tu PIN.' : errMsg(e)); });
    }
    return api('sync', { opId: op.id, pin: h, reports: [] }).then(function (res) { applySync(res); enterAs(op.id, h); })
      .catch(function (e) {
        if (e && e.offline) {
          var s0 = null; try { s0 = (JSON.parse(localStorage.getItem(LS) || 'null') || {}).session; } catch (x) {}
          if (s0 && s0.opId === op.id && s0.pinH === h) { enterAs(op.id, h); return; }
          loginFail('Necesitás señal para entrar la primera vez en este celular.');
        } else loginFail(errMsg(e));
      });
  }, function (e) { loginFail(errMsg(e)); });
}
function enterAs(opId, h) {
  S.session = { role: 'op', opId: opId, pinH: h }; S.pendingSession = null; save();
  S.login = newLogin('op');
  go('opHome'); syncNow();
}

/* operador: inicio */
function myReqs() { return S.myReqsDate === today() ? S.myReqs : []; }
function opHome() {
  var op = S.operators[S.session.opId]; if (!op) return '<p>Cargando…</p>';
  var m = S.machines[op.machineId], q = mineQueue(), fl = mineFailed();
  var h = '<div class="stack"><div><div class="muted">' + esc(dfull(today())) + '</div><h1 class="big">Hola, ' + esc(op.name.split(' ')[0]) + '</h1></div>';
  if (q.length) h += '<div class="callout warn">Tenés ' + q.length + ' informe' + (q.length > 1 ? 's' : '') + ' sin enviar. Se envían solos cuando haya señal. <button class="link" data-act="syncnow">Enviar ahora</button></div>';
  fl.forEach(function (f) { h += '<div class="callout">No se pudo enviar el informe del ' + esc(dlong(f.r.date)) + ' de ' + esc(mcode(f.r.machineId)) + ': ' + esc(ERR[f.error] || f.error) + '. Avisale a tu supervisor. <button class="link" data-act="discard" data-id="' + esc(f.r.id) + '">Descartar</button></div>'; });
  if (m) h += '<div class="mcard"><div class="mrow"><span class="eyebrow">Tu máquina</span><span class="mtype">' + esc(m.name) + '</span></div><div class="mrow"><div class="mcode">' + esc(m.code) + '</div>' + mIcon(m, true, 128) + '</div><div class="horo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff6a60" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M12 3v2"/></svg><span>Último horómetro</span><b>' + (m.horo > 0 ? fmt(m.horo) : '—') + '</b></div></div><button class="btn primary" data-act="newForm" data-m="' + esc(m.id) + '">Cargar informe de hoy</button>';
  else h += '<div class="callout warn">No tenés una máquina asignada. Pedí autorización para la que vas a usar.</div>';
  myReqs().forEach(function (r) {
    if (r.status === 'aprobada') h += '<div class="card"><div class="eyebrow">Autorizada para hoy</div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:6px 0 12px"><b class="mono" style="font-size:1.25rem">' + esc(r.machineCode) + '</b><span class="pill ok">Aprobada</span></div><button class="btn primary" data-act="newForm" data-m="' + esc(r.machineId) + '">Cargar informe con ' + esc(r.machineCode) + '</button></div>';
    else h += '<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span>Pediste <b class="mono">' + esc(r.machineCode) + '</b></span><span class="pill ' + (r.status === 'rechazada' ? 'crit' : 'warn') + '">' + (r.status === 'rechazada' ? 'Rechazada' : 'Esperando al supervisor') + '</span></div>';
  });
  h += '<button class="btn" data-act="hist">Mis informes</button><button class="btn" data-act="otra">Usé otra máquina</button>';
  if (installEv) h += '<button class="link" data-act="install" style="align-self:center">Instalar la app en este celular</button>';
  return h + '</div>';
}

/* operador: otra máquina */
function otraView() {
  var op = S.operators[S.session.opId], h = '<div class="stack"><button class="link" data-act="home" style="align-self:flex-start">← Volver</button><h1 class="big">¿Qué máquina vas a usar?</h1><p class="muted" style="margin:0">Tu supervisor tiene que autorizarla antes de que puedas cargar horas en ella. Para pedirla necesitás señal.</p>';
  var ms = machines().filter(function (m) { return m.id !== op.machineId; });
  h += '<div class="grid2">' + ms.map(function (m) { return '<button class="mbtn" data-act="reqPick" data-m="' + esc(m.id) + '" aria-pressed="' + (S.reqPick === m.id) + '">' + mIcon(m, S.reqPick === m.id, 64) + '<span>' + esc(m.code) + '</span></button>'; }).join('') + '</div>';
  if (S.reqPick) { var m = S.machines[S.reqPick]; h += '<div class="card"><b>' + esc(m.name) + '</b><div class="muted small">' + esc(m.code) + '</div></div><label class="fld">Motivo (opcional)<textarea class="txt" id="reqNote" data-in="reqNote" placeholder="Ej: mi máquina está en taller">' + esc(S.reqNote) + '</textarea></label><button class="btn primary" data-act="reqSend"' + (S.busy ? ' disabled' : '') + '>Pedir autorización</button>'; }
  return h + '</div>';
}
function reqSend() {
  if (S.busy) return; var m = S.machines[S.reqPick]; S.busy = true; render();
  api('request', { opId: S.session.opId, pin: S.session.pinH, machineId: m.id, reason: S.reqNote || '' }).then(function (res) {
    S.busy = false; S.myReqs = res.requests; S.myReqsDate = today(); S.reqPick = null; S.reqNote = ''; save(); toast('Pedido enviado al supervisor'); go('opHome');
  }).catch(function (e) { S.busy = false; if (e && (e.error === 'bad_pin')) { authLost(e); render(); return; } render(); toast(e && e.offline ? 'Necesitás señal para pedir autorización.' : errMsg(e)); });
}

/* operador: formulario */
function allowed() {
  var op = S.operators[S.session.opId], ids = []; if (op.machineId) ids.push(op.machineId);
  myReqs().forEach(function (r) { if (r.status === 'aprobada' && ids.indexOf(r.machineId) < 0) ids.push(r.machineId); });
  return ids.filter(function (i) { return S.machines[i]; });
}
function newForm(mid) {
  var m = S.machines[mid], primera = !(m.horo > 0);
  S.form = { machineId: mid, date: today(), hIni: primera ? '' : String(m.horo).replace('.', ','), unlock: primera, first: primera, hFin: '', works: [], pick: {}, prog: {}, hrs: {}, hrsEdited: false, fuel: null, ftype: 'Gasoil', liters: '', fhoro: '', notes: '', disp: false, nov: { t: '', sub: '', stop: '' } };
  go('form');
}
function formHTML() {
  var F = S.form, m = S.machines[F.machineId], al = allowed(), own = S.operators[S.session.opId].machineId;
  var h = '<div class="stack" style="gap:0"><button class="link" data-act="home" style="align-self:flex-start">← Cancelar</button><div class="mhead"><h1 class="big" style="font-size:1.875rem">Informe diario</h1>' + mIcon(m, false, 84) + '</div>';
  h += '<section class="blk"><h3><span>1</span>Máquina y fecha</h3>';
  if (al.length > 1) h += '<div class="grid2">' + al.map(function (i) { return '<button class="mbtn" data-act="fmach" data-m="' + esc(i) + '" aria-pressed="' + (i === F.machineId) + '">' + mIcon(S.machines[i], i === F.machineId, 64) + '<span>' + esc(mcode(i)) + '</span></button>'; }).join('') + '</div>';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><b class="mono" style="font-size:2rem">' + esc(m.code) + '</b><span class="muted">' + esc(m.name) + (F.machineId !== own ? ' · autorizada' : '') + '</span></div>';
  h += '<label class="fld">Fecha<input class="txt" type="date" id="f-date" data-in="date" value="' + esc(F.date) + '" max="' + today() + '"></label></section>';
  h += '<section class="blk"><h3><span>2</span>Horómetro</h3>';
  h += '<p class="muted small" style="margin:0">¿Cómo estuvo la máquina hoy?</p><div class="grid2"><button class="tg c" data-act="disp" data-v="0" aria-pressed="' + (!F.disp) + '">Trabajó</button><button class="tg c" data-act="disp" data-v="1" aria-pressed="' + (!!F.disp) + '">A disposición</button></div>';
  if (F.disp) {
    h += '<div class="itpick"><div class="small"><b>¿Por qué quedó a disposición?</b></div><div class="tgl">' + DISPS.map(function (x) { return '<button class="tg" data-act="dreason" data-v="' + x[0] + '" aria-pressed="' + (F.nov.t === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    if (F.nov.t === 'averia') h += '<div class="itpick"><div class="small"><b>¿Qué falló?</b></div><div class="tgl">' + AVS.map(function (x) { return '<button class="tg" data-act="novsub" data-v="' + x[0] + '" aria-pressed="' + (F.nov.sub === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    h += '<label class="fld">Horómetro (queda igual)<input class="num" id="f-hini" data-in="hIni" inputmode="decimal" autocomplete="off" value="' + esc(F.hIni) + '"' + (F.unlock ? '' : ' readonly') + '></label>';
    if (F.first) h += '<p class="muted small" style="margin:0">Es el primer informe de esta máquina. Escribí el número que marca el horómetro ahora.</p>';
    if (!F.unlock) h += '<button class="link" data-act="unlock" style="align-self:flex-start">El horómetro no marca ese número</button>';
    h += '<div class="hbox" id="hbox"><span>Horas trabajadas</span><span class="mono" id="hval">0 h</span></div><div class="small muted" id="hmsg" style="min-height:1.2em">Día a disposición: no se pide el horómetro final ni los trabajos.</div></section>';
    h += '<section class="blk off"><h3><span>3</span>Trabajos realizados' + (m.inf ? '<em class="inf">Informe ' + esc(m.inf) + '</em>' : '') + '</h3><div class="dispnote">No corresponde: la máquina quedó a disposición.</div></section>';
  } else {
  h += '<label class="fld">Inicial' + (F.unlock ? '' : ' <span class="muted" style="font-weight:400">(el último que se registró)</span>') + '<input class="num" id="f-hini" data-in="hIni" inputmode="decimal" autocomplete="off" value="' + esc(F.hIni) + '"' + (F.unlock ? '' : ' readonly') + '></label>';
  if (F.first) h += '<p class="muted small" style="margin:0">Es el primer informe de esta máquina. Escribí el número que marca el horómetro ahora, antes de empezar.</p>';
  if (!F.unlock) h += '<button class="link" data-act="unlock" style="align-self:flex-start">El horómetro no marca ese número</button>';
  h += '<label class="fld">Final<input class="num" id="f-hfin" data-in="hFin" inputmode="decimal" autocomplete="off" placeholder="0000,0" value="' + esc(F.hFin) + '"></label>';
  h += '<div class="hbox" id="hbox"><span>Horas trabajadas</span><span class="mono" id="hval">—</span></div><div class="small" id="hmsg" style="min-height:1.2em"></div></section>';
  h += '<section class="blk"><h3><span>3</span>Trabajos realizados' + (m.inf ? '<em class="inf">Informe ' + esc(m.inf) + '</em>' : '') + '</h3><div id="wblk" class="stack tight">' + worksHTML() + '</div></section>';
  }
  h += '<section class="blk"><h3><span>4</span>Combustible</h3><p class="muted small" style="margin:0">¿Cargaste combustible?</p><div class="grid2"><button class="tg c" data-act="fuel" data-v="no" aria-pressed="' + (F.fuel === false) + '">No</button><button class="tg c" data-act="fuel" data-v="si" aria-pressed="' + (F.fuel === true) + '">Sí</button></div>';
  h += '<div id="fuelf" class="stack tight"' + (F.fuel === true ? '' : ' hidden') + '><div class="grid2"><button class="tg c" data-act="ftype" data-v="Gasoil" aria-pressed="' + (F.ftype === 'Gasoil') + '">Gasoil</button><button class="tg c" data-act="ftype" data-v="Nafta" aria-pressed="' + (F.ftype === 'Nafta') + '">Nafta</button></div><label class="fld">Litros cargados<input class="num" id="f-lit" data-in="liters" inputmode="decimal" autocomplete="off" value="' + esc(F.liters) + '"></label>' + (F.disp ? '<p class="muted small" style="margin:0">El horómetro al cargar es el mismo del día (queda igual).</p>' : '<label class="fld">Horómetro al cargar<input class="num" id="f-fh" data-in="fhoro" inputmode="decimal" autocomplete="off" value="' + esc(F.fhoro) + '"></label>') + '</div></section>';
  if (F.disp) h += '<section class="blk"><h3><span>5</span>Detalle</h3><div class="stack tight"><label class="fld"><span class="muted" style="font-weight:400">Detalle para tu supervisor (opcional)</span><textarea class="txt" id="f-notes" data-in="notes">' + esc(F.notes) + '</textarea></label></div></section>';
  else h += '<section class="blk"><h3><span>5</span>Novedades</h3><div id="novblk" class="stack tight">' + novHTML() + '</div></section>';
  h += '<div id="errs"></div><button class="btn primary" id="send" data-act="send">Enviar informe</button></div>';
  return h;
}
var NOVS = [['', 'Sin novedad'], ['averia', 'Falla mecánica'], ['lluvia', 'Parada por lluvia'], ['material', 'Falta de material'], ['otra', 'Otra']];
var NOV_N = { averia: 'Falla mecánica', lluvia: 'Parada por lluvia', material: 'Falta de material', otra: 'Otra novedad' };
var AVS = [['motor', 'Motor'], ['hidraulico', 'Hidráulico'], ['neumaticos', 'Neumáticos'], ['electrico', 'Eléctrico'], ['otra', 'Otra falla']];
var DISPS = [['lluvia', 'Lluvia'], ['averia', 'Falla mecánica'], ['frente', 'Sin frente de trabajo'], ['otra', 'Otros']];
var DISP_N = {}; DISPS.forEach(function (x) { DISP_N[x[0]] = x[1]; });
var AV_N = {}; AVS.forEach(function (a) { AV_N[a[0]] = a[1]; });
function novText(n) { if (!n || !n.t) return ''; if (n.disp) return 'A disposición · ' + (DISP_N[n.t] || n.t) + (n.t === 'averia' && n.sub ? ' · ' + (AV_N[n.sub] || n.sub) : ''); return (NOV_N[n.t] || n.t) + (n.t === 'averia' && n.sub ? ' · ' + (AV_N[n.sub] || n.sub) : '') + (n.stop > 0 ? ' · ' + fmt(n.stop) + ' h parada' : ''); }
function novHTML() {
  var N = S.form.nov, h = '<p class="muted small" style="margin:0">¿Pasó algo que haya frenado la máquina?</p><div class="tgl">' + NOVS.map(function (x) { return '<button class="tg" data-act="nov" data-v="' + x[0] + '" aria-pressed="' + (N.t === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
  if (N.t === 'averia') h += '<div class="itpick"><div class="small"><b>¿Qué falló?</b></div><div class="tgl">' + AVS.map(function (x) { return '<button class="tg" data-act="novsub" data-v="' + x[0] + '" aria-pressed="' + (N.sub === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
  if (N.t) h += '<label class="fld">Horas que estuvo parada<input class="num" data-in="nstop" inputmode="decimal" autocomplete="off" placeholder="0,0" value="' + esc(N.stop) + '"></label><p class="muted small" style="margin:0">Estas horas no se restan del horómetro: sirven para saber cuánto tiempo estuvo parada la máquina. Si estuvo parada todo el día, dejá el horómetro final igual al inicial.</p>';
  h += '<label class="fld"><span class="muted" style="font-weight:400">' + (N.t === 'otra' ? 'Contanos qué pasó' : 'Detalle para tu supervisor (opcional)') + '</span><textarea class="txt" id="f-notes" data-in="notes">' + esc(S.form.notes) + '</textarea></label>';
  return h;
}
function totalHours() { var F = S.form, a = parseNum(F.hIni), b = parseNum(F.hFin); return isFinite(a) && isFinite(b) ? r1(b - a) : NaN; }
/* trabajos del informe de la máquina y, para cada uno, los ítems del certificado donde puede cargarse */
var INFORMES = { A: 'Asfalto', B: 'Conformación y compactación', C: 'Movimiento de suelos', D: 'Transporte' };
function catWorks(m) {
  var inf = (m && m.inf) || '';
  return S.catalog.works.filter(function (w) { return w.inf === inf; });
}
function workById(id) { var r = null; S.catalog.works.forEach(function (w) { if (w.id === id) r = w; }); return r; }
function itemName(id) { var i = S.catalog.items[id]; return i ? i.name : id; }
function lineList() {
  var F = S.form, out = [];
  F.works.forEach(function (wid) {
    var w = workById(wid); if (!w) return;
    if (w.items.length) w.items.forEach(function (iid) { if (F.pick[wid] && F.pick[wid][iid]) out.push({ k: wid + '|' + iid, w: wid, i: iid }); });
    else out.push({ k: wid + '|', w: wid, i: '' });
  });
  return out;
}
function lineLabel(l) { var w = workById(l.w); return (w ? w.name : l.w) + (l.i ? ' → ' + itemName(l.i) : ''); }
function worksHTML() {
  var F = S.form, m = S.machines[F.machineId], ws = catWorks(m);
  if (!ws.length) return '<div class="callout warn">Todavía no se descargaron los trabajos de esta máquina. Conectate a internet un momento y volvé a entrar.</div>';
  var h = '<p class="muted small" style="margin:0">Tocá todos los que hiciste.</p><div class="tgl">' + ws.map(function (w) { return '<button class="tg" data-act="work" data-w="' + esc(w.id) + '" aria-pressed="' + (F.works.indexOf(w.id) > -1) + '">' + esc(w.name) + '</button>'; }).join('') + '</div>';
  F.works.forEach(function (wid) {
    var w = workById(wid); if (!w || !w.items.length) return;
    h += '<div class="itpick"><div class="small"><b>' + esc(w.name) + '</b>: ¿para qué ítem lo hiciste?</div><div class="tgl">' + w.items.map(function (iid) { return '<button class="tg" data-act="witem" data-w="' + esc(wid) + '" data-i="' + esc(iid) + '" aria-pressed="' + !!(F.pick[wid] && F.pick[wid][iid]) + '">' + esc(itemName(iid)) + '</button>'; }).join('') + '</div></div>';
  });
  return h + '<div id="hrows">' + hrowsHTML() + '</div>';
}
/* progresiva: se escribe 102120 o 102+120 y queda 102+120 (kilómetro + metros) */
function parseProg(v) {
  v = String(v == null ? '' : v).trim(); if (!v) return null;
  var km, m, p = v.split('+');
  if (p.length === 2) { if (!/^\d{1,3}$/.test(p[0].trim()) || !/^\d{1,3}$/.test(p[1].trim())) return false; km = +p[0]; m = +p[1]; }
  else { var d = v.replace(/\D/g, ''); if (!d || d !== v.replace(/\s/g, '') || d.length > 6) return false; var n = +d; km = Math.floor(n / 1000); m = n % 1000; }
  if (m > 999) return false;
  return { txt: km + '+' + ('00' + m).slice(-3), m: km * 1000 + m };
}
function hrowsHTML() {
  var F = S.form, ls = lineList(), n = ls.length; if (!n) return '';
  var h = '<div class="stack tight">' + (n > 1 ? '<p class="muted small" style="margin:6px 0 0">Repartí las horas entre los trabajos.</p>' : '');
  ls.forEach(function (l) {
    var p = F.prog[l.k] || {};
    h += '<div class="lcard"><b class="small">' + esc(lineLabel(l)) + '</b>';
    if (n > 1) h += '<div class="hrow"><span>Horas</span><input data-in="hrs" data-k="' + esc(l.k) + '" inputmode="decimal" autocomplete="off" value="' + esc(F.hrs[l.k] == null ? '' : F.hrs[l.k]) + '"></div>';
    if (l.i) h += '<div class="prow"><label>Progresiva desde<input data-in="pa" data-k="' + esc(l.k) + '" inputmode="numeric" autocomplete="off" placeholder="102+120" value="' + esc(p.a || '') + '"></label><label>hasta<input data-in="pb" data-k="' + esc(l.k) + '" inputmode="numeric" autocomplete="off" placeholder="102+700" value="' + esc(p.b || '') + '"></label></div>';
    h += '</div>';
  });
  if (n > 1) h += '<div class="small" id="hsum" style="font-weight:600"></div>';
  else h += '<p class="muted small" style="margin:0">Todas las horas van a «' + esc(lineLabel(ls[0])) + '».</p>';
  return h + '</div>';
}
function split() {
  var F = S.form, t = totalHours(), ls = lineList(), n = ls.length; if (!(t > 0) || n < 2) return;
  var each = r1(t / n), acc = 0; ls.forEach(function (l, i) { var v = i === n - 1 ? r1(t - acc) : each; acc += v; F.hrs[l.k] = String(v).replace('.', ','); });
}
function liveUpdate() {
  var F = S.form, t = totalHours(), box = document.getElementById('hbox'), val = document.getElementById('hval'), msg = document.getElementById('hmsg'); if (!box) return;
  if (F.disp) { val.textContent = '0 h'; box.className = 'hbox'; return; }
  if (isFinite(t) && t > 0 && t <= 24) { val.textContent = fmt(t) + ' h'; box.className = 'hbox'; msg.textContent = t > 14 ? 'Son muchas horas. Revisá el número final.' : ''; msg.style.color = 'var(--warn)'; }
  else if (t === 0 && sinTrabajo()) { val.textContent = '0 h'; box.className = 'hbox'; msg.textContent = 'Día sin trabajar: se guarda con la novedad.'; msg.style.color = 'var(--muted)'; }
  else if (isFinite(t)) { val.textContent = '—'; box.className = 'hbox bad'; msg.textContent = t <= 0 ? 'El horómetro final tiene que ser mayor que el inicial.' : 'Son más de 24 horas. Revisá el horómetro final.'; msg.style.color = 'var(--crit)'; }
  else { val.textContent = '—'; box.className = 'hbox'; msg.textContent = ''; }
  var ls = lineList();
  if (ls.length > 1) {
    if (!F.hrsEdited) { split(); document.querySelectorAll('#hrows input[data-in="hrs"]').forEach(function (i) { i.value = F.hrs[i.dataset.k] || ''; }); }
    var s = 0; ls.forEach(function (l) { var v = parseNum(F.hrs[l.k]); if (isFinite(v)) s += v; }); s = r1(s);
    var el = document.getElementById('hsum'); if (el) { if (isFinite(t) && t > 0) { var ok = Math.abs(s - t) <= 0.05; el.textContent = 'Sumás ' + fmt(s) + ' de ' + fmt(t) + ' h' + (ok ? ' ✓' : ''); el.style.color = ok ? 'var(--good)' : 'var(--warn)'; } else el.textContent = ''; }
  }
}
function sinTrabajo() { var N = S.form.nov, p = parseNum(N.stop); return !!N.t && isFinite(p) && p > 0; }
function showErrs(list) {
  var e = document.getElementById('errs'); if (!e) return;
  e.innerHTML = list.length ? '<div class="callout" role="alert">Revisá esto antes de enviar:<ul>' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
  if (list.length && e.scrollIntoView) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function buildReport() {
  var F = S.form, m = S.machines[F.machineId], errs = [], flags = [];
  var hIni = parseNum(F.hIni), hFin = parseNum(F.hFin), hours = 0, t = today();
  if (!isFinite(hIni)) errs.push('Falta el horómetro inicial.');
  if (F.disp) hFin = hIni;
  if (!isFinite(hFin)) errs.push('Falta el horómetro final.');
  var dia0 = F.disp ? isFinite(hIni) : (isFinite(hIni) && isFinite(hFin) && hFin === hIni && sinTrabajo());
  if (isFinite(hIni) && isFinite(hFin)) {
    hours = r1(hFin - hIni);
    if (dia0) hours = 0;
    else if (hours <= 0) errs.push('El horómetro final tiene que ser mayor que el inicial.');
    else if (hours > 24) errs.push('Son más de 24 horas. Revisá el horómetro final.');
    else if (hours > 14) flags.push('Más de 14 horas en un informe');
  }
  if (!F.date || F.date > t) errs.push('La fecha no puede ser de un día futuro.');
  else if (F.date !== t) flags.push('Fecha distinta de hoy');
  var lines = [], ls = lineList();
  if (!F.works.length && !dia0) errs.push('Elegí al menos un trabajo realizado.');
  if (!dia0) F.works.forEach(function (wid) { var w = workById(wid); if (w && w.items.length && !ls.some(function (l) { return l.w === wid; })) errs.push('Elegí para qué ítem hiciste «' + w.name + '».'); });
  if (dia0) { /* sin líneas */ } else if (ls.length === 1) lines.push({ w: ls[0].w, i: ls[0].i, h: hours > 0 ? hours : 0 });
  else if (ls.length > 1) {
    var s = 0; ls.forEach(function (l) { var v = parseNum(F.hrs[l.k]); if (!isFinite(v) || v < 0) v = 0; v = r1(v); lines.push({ w: l.w, i: l.i, h: v }); s += v; }); s = r1(s);
    if (hours > 0 && Math.abs(s - hours) > 0.05) errs.push('Las horas de los trabajos suman ' + fmt(s) + ' y tienen que sumar ' + fmt(hours) + '.');
    else if (lines.some(function (l) { return !(l.h > 0); })) errs.push('Falta repartir horas en uno de los trabajos. Si no lo hiciste, sacalo.');
  }
  if (!dia0) ls.forEach(function (l, k) {
    if (!l.i) return;
    var p = F.prog[l.k] || {}, a = parseProg(p.a), b = parseProg(p.b), nm = lineLabel(l);
    if (!a || !b) errs.push('Completá la progresiva desde y hasta de «' + nm + '» (ej. 102+120).');
    else if (a.m === b.m) errs.push('La progresiva desde y hasta de «' + nm + '» no pueden ser iguales.');
    else if (lines[k]) { lines[k].pi = a.txt; lines[k].pf = b.txt; }
  });
  var nov = null, N = F.nov;
  if (F.disp) {
    if (!N.t) errs.push('Elegí por qué quedó a disposición.');
    else if (N.t === 'averia' && !N.sub) errs.push('Elegí qué falló.');
    else nov = { t: N.t, sub: N.t === 'averia' ? N.sub : '', stop: 0, disp: true };
    if (N.t === 'averia') flags.push('Falla mecánica' + (N.sub ? ' (' + (AV_N[N.sub] || N.sub) + ')' : ''));
  } else if (N.t) {
    var np = parseNum(N.stop);
    if (N.t === 'averia' && !N.sub) errs.push('Elegí qué falló.');
    if (!isFinite(np) || np <= 0) errs.push('Escribí cuántas horas estuvo parada la máquina.');
    else if (np > 24) errs.push('Las horas de parada no pueden ser más de 24.');
    if (N.t === 'otra' && !F.notes.trim()) errs.push('Contanos qué pasó en «Otra».');
    if (isFinite(np) && np > 0 && np <= 24) nov = { t: N.t, sub: N.t === 'averia' ? N.sub : '', stop: r1(np) };
    if (N.t === 'averia') flags.push('Falla mecánica' + (N.sub ? ' (' + (AV_N[N.sub] || N.sub) + ')' : ''));
  }
  var fuel = null;
  if (F.fuel === null) errs.push('Contestá si cargaste combustible.');
  else if (F.fuel) {
    var L = parseNum(F.liters), fh = F.disp ? hIni : parseNum(F.fhoro);
    if (!(L > 0)) errs.push('Falta cuántos litros cargaste.'); else if (L > 600) flags.push('Carga de más de 600 litros');
    if (!isFinite(fh)) errs.push('Falta el horómetro al cargar combustible.');
    else if (isFinite(hIni) && isFinite(hFin) && (fh < hIni || fh > hFin)) errs.push('El horómetro de la carga tiene que estar entre ' + fmt(hIni) + ' y ' + fmt(hFin) + '.');
    if (L > 0 && isFinite(fh)) fuel = { type: F.ftype, liters: L, horo: fh };
  }
  if (F.unlock && !F.first && isFinite(hIni) && Math.abs(hIni - m.horo) > 0.05) flags.push('Horómetro inicial distinto al último registrado (' + fmt(m.horo) + ')');
  return { errs: errs, report: { id: uid(), date: F.date, machineId: m.id, hIni: hIni, hFin: hFin, lines: lines, fuel: fuel, nov: nov, notes: F.notes.trim(), flags: flags, disp: !!F.disp, createdAt: new Date().toISOString() }, hours: hours };
}
function submitForm() {
  var b = buildReport(); if (b.errs.length) { showErrs(b.errs); return; }
  var r = b.report, m = S.machines[r.machineId];
  S.queue.push({ opId: S.session.opId, r: r });
  m.horo = Math.max(m.horo, r.hFin);
  S.last = { id: r.id, date: r.date, machineCode: m.code, hIni: r.hIni, hFin: r.hFin, hours: b.hours, lines: r.lines.map(function (l) { return { label: lineLabel(l), h: l.h, pi: l.pi, pf: l.pf }; }), fuel: r.fuel, nov: r.nov, flags: r.flags };
  save(); go('done'); syncNow();
}
function doneView() {
  var r = S.last; if (!r) return '';
  var it = r.lines.map(function (l) { return l.label + (l.pi ? ' (' + l.pi + ' a ' + l.pf + (r.lines.length > 1 ? ', ' + fmt(l.h) + ' h' : '') + ')' : (r.lines.length > 1 ? ' (' + fmt(l.h) + ' h)' : '')); }).join(', ');
  var enCola = S.queue.some(function (q) { return q.r.id === r.id; });
  var estado = enCola ? '<div class="callout warn" style="text-align:left">Guardado en este celular. Se envía solo cuando haya señal.</div>' : '<div class="callout ok" style="text-align:left">Recibido por División de Equipos y Maquinaria ✓</div>';
  return '<div class="done stack"><div class="check">✓</div><h1 class="big">Informe cargado</h1><dl class="sum"><dt>Máquina</dt><dd class="mono">' + esc(r.machineCode) + '</dd><dt>Fecha</dt><dd>' + esc(dlong(r.date)) + '</dd><dt>Horas</dt><dd class="mono">' + fmt(r.hours) + ' h (' + fmt(r.hIni) + ' → ' + fmt(r.hFin) + ')</dd><dt>Trabajos</dt><dd>' + esc(it) + '</dd><dt>Combustible</dt><dd>' + (r.fuel ? fmt(r.fuel.liters, 0) + ' L de ' + esc(r.fuel.type) : 'No cargó') + '</dd></dl>' + estado + (r.flags.length ? '<div class="callout warn" style="text-align:left">Tu supervisor va a revisar este informe: ' + esc(r.flags.join('; ')) + '.</div>' : '') + '<button class="btn primary" data-act="home">Listo</button></div>';
}


/* ---------- operador: mis informes (respaldo) ---------- */
function histItems() {
  var H = S.hist, own = S.session ? S.session.opId : '', byId = {}, out = [];
  (H.opId === own ? H.list : []).forEach(function (r) { byId[r.id] = 1; out.push(r); });
  mineQueue().forEach(function (q) {
    if (byId[q.r.id]) return; var r = q.r;
    out.push({ id: r.id, date: r.date, machineId: r.machineId, machineCode: mcode(r.machineId), hIni: r.hIni, hFin: r.hFin, hours: r1(r.hFin - r.hIni), lines: r.lines, fuel: r.fuel, nov: r.nov || null, notes: r.notes, rec: '', local: true });
  });
  out.sort(function (a, b) { return a.date === b.date ? (a.local ? -1 : 0) : (a.date < b.date ? 1 : -1); });
  return out;
}
function loadHist() {
  var H = S.hist; if (!S.session || S.session.role !== 'op') return;
  H.loading = true; H.err = '';
  api('myReports', { opId: S.session.opId, pin: S.session.pinH }).then(function (res) {
    H.opId = S.session.opId; H.list = res.reports || []; H.at = new Date().toISOString(); H.loading = false; save(); if (S.view === 'hist') render();
  }).catch(function (e) {
    H.loading = false; H.err = e && e.offline ? 'offline' : errMsg(e);
    if (e && e.error === 'bad_pin') { authLost(e); render(); return; }
    if (S.view === 'hist') render();
  });
}
function histLineText(l) {
  var w = workById(l.w), nm = (w ? w.name : l.w) + (l.i ? ' → ' + itemName(l.i) : '');
  return { name: nm, h: l.h, prog: l.pi ? l.pi + ' a ' + l.pf : '' };
}
function histLines(r) {
  if (r.lines && r.lines.length) return r.lines.map(histLineText);
  return Object.keys(r.items || {}).map(function (k) { return { name: ITEM_N[k] || k, h: r.items[k], prog: '' }; });
}
function histView() {
  var H = S.hist, h = '<div class="stack"><button class="link" data-act="' + (H.open ? 'hlist' : 'home') + '" style="align-self:flex-start">← Volver</button>';
  var it = null; histItems().forEach(function (r) { if (r.id === H.open) it = r; });
  if (H.open && it) return h + histDetail(it) + '</div>';
  var all = histItems(), lim = H.range === '30' ? addDays(today(), -29) : '', list = all.filter(function (r) { return !lim || r.date >= lim; });
  h += '<h1 class="big">Mis informes</h1><p class="muted" style="margin:0">Acá queda tu respaldo de todo lo que cargaste.</p>';
  h += '<div class="tabs2"><button data-act="hrange" data-v="30" aria-pressed="' + (H.range === '30') + '">Últimos 30 días</button><button data-act="hrange" data-v="all" aria-pressed="' + (H.range === 'all') + '">Todos</button></div>';
  if (H.loading && !all.length) h += '<p class="muted">Cargando…</p>';
  if (H.err === 'offline') h += '<div class="callout warn">Sin señal: se muestra lo último que se descargó' + (H.at ? ' (' + esc(fmtRec(H.at)) + ')' : '') + '.</div>';
  else if (H.err) h += '<div class="callout">' + esc(H.err) + '</div>';
  if (!list.length && !H.loading) h += '<div class="card"><p class="muted" style="margin:0">' + (all.length ? 'No hay informes en los últimos 30 días.' : 'Todavía no tenés informes cargados.') + '</p></div>';
  h += list.slice(0, H.shown).map(function (r) {
    var st = r.local ? '<span class="pill warn">Sin enviar</span>' : '<span class="pill ok">Recibido ✓</span>';
    return '<button class="hitem" data-act="hopen" data-id="' + esc(r.id) + '"><div class="hrw"><b>' + esc(dlong(r.date)) + '</b>' + st + '</div><div class="hrw sub"><span class="mono">' + esc(r.machineCode) + '</span><span>' + (r.hours > 0 ? fmt(r.hours) + ' h' : 'Sin horas') + (r.nov ? ' · ' + esc(NOV_N[r.nov.t] || 'Novedad') : '') + '</span></div></button>';
  }).join('');
  if (list.length > H.shown) h += '<button class="btn" data-act="hmore">Mostrar más</button>';
  return h + '</div>';
}
function histDetail(r) {
  var m = S.machines[r.machineId], op = S.operators[S.session.opId], ls = histLines(r), many = ls.length > 1;
  var h = '<div><div class="muted">Informe del</div><h1 class="big" style="font-size:1.75rem">' + esc(dfullY(r.date).toLowerCase()) + '</h1></div>';
  h += '<dl class="sum"><dt>Máquina</dt><dd><span class="mono">' + esc(r.machineCode) + '</span>' + (m ? '<div class="muted small" style="font-weight:400">' + esc(m.name) + '</div>' : '') + '</dd>';
  h += '<dt>Operador</dt><dd>' + esc(op ? op.name : '') + '</dd>';
  h += '<dt>Horómetro</dt><dd class="mono">' + fmt(r.hIni) + ' → ' + fmt(r.hFin) + '</dd><dt>Horas</dt><dd class="mono">' + fmt(r.hours) + ' h</dd>';
  h += '<dt>Trabajos</dt><dd>' + (ls.length ? ls.map(function (l) { return '<div class="hl">' + esc(l.name) + (l.prog ? '<div class="muted small" style="font-weight:400">Progresiva ' + esc(l.prog) + (many ? ' · ' + fmt(l.h) + ' h' : '') + '</div>' : (many ? '<div class="muted small" style="font-weight:400">' + fmt(l.h) + ' h</div>' : '')) + '</div>'; }).join('') : 'Sin trabajo (máquina parada)') + '</dd>';
  h += '<dt>Combustible</dt><dd>' + (r.fuel ? fmt(r.fuel.liters, 0) + ' L de ' + esc(r.fuel.type) + '<div class="muted small" style="font-weight:400">Horómetro al cargar: ' + fmt(r.fuel.horo) + '</div>' : 'No cargó') + '</dd>';
  h += '<dt>Novedades</dt><dd>' + (r.nov ? esc(novText(r.nov)) : 'Sin novedad') + '</dd>';
  if (r.notes) h += '<dt>Detalle</dt><dd style="font-weight:500">' + esc(r.notes) + '</dd>';
  h += '<dt>Comprobante</dt><dd class="mono">' + esc(comprobante(r.id)) + '</dd></dl>';
  if (r.local) h += '<div class="callout warn" style="text-align:left">Guardado en este celular. Todavía no llegó: se envía solo cuando haya señal.</div>';
  else h += '<div class="callout ok" style="text-align:left">Recibido por División de Equipos y Maquinaria ✓' + (r.rec ? '<div class="small" style="font-weight:500;margin-top:2px">' + esc(fmtRec(r.rec)) + '</div>' : '') + '</div><button class="btn" data-act="share" data-id="' + esc(r.id) + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Compartir como imagen</button>';
  return h;
}
/* imagen del informe para compartir (se dibuja en un canvas) */
function wrapText(c, text, x, y, maxW, lh) {
  var words = String(text).split(' '), line = '', yy = y;
  words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = t; });
  if (line) { c.fillText(line, x, yy); yy += lh; }
  return yy;
}
function reportImage(r) {
  return new Promise(function (resolve) {
    var W = 1080, P = 56, fam = (getComputedStyle(document.body).fontFamily || 'sans-serif');
    var m = S.machines[r.machineId], op = S.operators[S.session.opId], ls = histLines(r), many = ls.length > 1;
    var rows = [['Máquina', r.machineCode + (m ? ' · ' + m.name : '')], ['Operador', op ? op.name : ''], ['Horómetro', fmt(r.hIni) + ' → ' + fmt(r.hFin)], ['Horas', fmt(r.hours) + ' h']];
    rows.push(['Trabajos', ls.length ? ls.map(function (l) { return '• ' + l.name + (l.prog ? ' (progresiva ' + l.prog + (many ? ', ' + fmt(l.h) + ' h' : '') + ')' : (many ? ' (' + fmt(l.h) + ' h)' : '')); }).join('\n') : 'Sin trabajo (máquina parada)']);
    rows.push(['Combustible', r.fuel ? fmt(r.fuel.liters, 0) + ' L de ' + r.fuel.type + ' (horómetro ' + fmt(r.fuel.horo) + ')' : 'No cargó']);
    rows.push(['Novedades', r.nov ? novText(r.nov) : 'Sin novedad']);
    if (r.notes) rows.push(['Detalle', r.notes]);
    var cv = document.createElement('canvas'), c = cv.getContext('2d');
    function draw(logo, H) {
      cv.width = W; cv.height = H; c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.textBaseline = 'alphabetic';
      var y = P;
      if (logo && logo.width) { var lw = 220, lh = logo.height * lw / logo.width; c.drawImage(logo, P, y, lw, lh); y += lh + 28; } else y += 10;
      c.fillStyle = '#d31f16'; c.fillRect(P, y, 64, 6); y += 40;
      c.fillStyle = '#666666'; c.font = '600 28px ' + fam; c.fillText('INFORME DIARIO DE EQUIPOS', P, y); y += 52;
      c.fillStyle = '#0e0e0e'; c.font = '700 46px ' + fam; y = wrapText(c, dfullY(r.date), P, y, W - 2 * P, 54); y += 6;
      c.fillStyle = '#666666'; c.font = '500 28px ' + fam; c.fillText('Comprobante N.º ' + comprobante(r.id), P, y); y += 44;
      c.strokeStyle = '#dadada'; c.lineWidth = 2; c.beginPath(); c.moveTo(P, y); c.lineTo(W - P, y); c.stroke(); y += 18;
      rows.forEach(function (row) {
        c.fillStyle = '#666666'; c.font = '500 26px ' + fam; c.fillText(row[0], P, y + 30);
        c.fillStyle = '#0e0e0e'; c.font = '600 30px ' + fam;
        var yy = y + 32; String(row[1]).split('\n').forEach(function (pt) { yy = wrapText(c, pt, P + 250, yy, W - 2 * P - 250, 40); });
        y = Math.max(yy, y + 46) + 10;
        c.strokeStyle = '#ececec'; c.beginPath(); c.moveTo(P, y - 4); c.lineTo(W - P, y - 4); c.stroke();
      });
      y += 22;
      c.fillStyle = '#e3f4e8'; c.beginPath(); if (c.roundRect) c.roundRect(P, y, W - 2 * P, 112, 22); else c.rect(P, y, W - 2 * P, 112); c.fill();
      c.fillStyle = '#176b34'; c.font = '700 32px ' + fam; c.fillText('Recibido por División de Equipos y Maquinaria ✓', P + 28, y + 50);
      c.font = '500 26px ' + fam; c.fillText(fmtRec(r.rec), P + 28, y + 90);
      return y + 112 + P;
    }
    function finish(logo) {
      var H = draw(logo, 3000); // primera pasada para medir el alto
      draw(logo, H);
      if (cv.toBlob) cv.toBlob(function (b) { resolve(b); }, 'image/png'); else resolve(null);
    }
    var img = new Image(); img.onload = function () { finish(img); }; img.onerror = function () { finish(null); }; img.src = 'icons/logo.png';
  });
}
function shareReport(id) {
  var r = null; histItems().forEach(function (x) { if (x.id === id) r = x; }); if (!r) return;
  toast('Preparando la imagen…');
  reportImage(r).then(function (blob) {
    if (!blob) { toast('No se pudo crear la imagen.'); return; }
    var name = 'informe-' + r.machineCode + '-' + r.date + '.png', file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: 'Informe del ' + dfullY(r.date) + ' · ' + r.machineCode }).catch(function (e) { if (e && e.name !== 'AbortError') downloadBlob(blob, name); });
    }
    downloadBlob(blob, name);
  });
}
function downloadBlob(blob, name) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast('Imagen guardada en tu celular.');
}

/* ---------- supervisor ---------- */
function supLogin(pin) {
  var L = S.login; L.busy = true; render();
  S.f = { from: addDays(today(), -29), to: today(), machine: 'all' };
  sha('sup:' + pin + SAL).then(function (h) {
    return api('supData', { pin: h, from: S.f.from, to: S.f.to }).then(function (res) { S.session = { role: 'sup', pinH: h }; S.sup = res; L.busy = false; L.pin = ''; go('sup'); });
  }).catch(function (e) { loginFail(e && e.offline ? 'Necesitás señal para entrar como supervisor.' : errMsg(e)); });
}
function loadSup() {
  S.supLoading = true; render();
  api('supData', { pin: S.session.pinH, from: S.f.from, to: S.f.to }).then(function (res) { S.sup = res; S.supLoading = false; render(); })
    .catch(function (e) { S.supLoading = false; render(); toast(e && e.offline ? 'Sin señal: no se pudo actualizar.' : errMsg(e)); });
}
function supFail(e) { toast(e && e.offline ? 'Sin señal: no se pudo guardar.' : errMsg(e)); }
function filt(mach) {
  var f = S.f, mm = mach == null ? f.machine : mach; return S.sup.reports.filter(function (r) { return mm === 'all' || r.machineId === mm; });
}
function workdays(a, b) { var n = 0, p = a.split('-'), q = b.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]), e = new Date(+q[0], +q[1] - 1, +q[2]); for (; d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n++; return n; }
function stats(mach) {
  var mm = mach == null ? S.f.machine : mach, rs = filt(mm), f = S.f, wd = workdays(f.from, f.to), sh = S.sup.config.shiftHours || 9, fp = S.sup.config.fuelPrice || 0;
  var ms = S.sup.machines.filter(function (m) { return mm === 'all' || m.id === mm; });
  var byM = {}; S.sup.machines.forEach(function (m) { byM[m.id] = m; });
  var rows = ms.map(function (m) {
    var x = rs.filter(function (r) { return r.machineId === m.id; }), days = {}, h = 0, L = 0;
    x.forEach(function (r) { days[r.date] = 1; h += r.hours; if (r.fuel) L += r.fuel.liters; });
    var nd = Object.keys(days).length, lph = h > 0 && L > 0 ? L / h : null, prog = wd * sh;
    return { m: m, days: nd, hours: h, liters: L, lph: lph, ref: m.refLph, hpd: nd ? h / nd : 0, util: prog ? h / prog : 0, cost: h * (m.tarifa || 0) + L * fp };
  });
  var items = {}; rs.forEach(function (r) { var m = byM[r.machineId], t = m ? m.tarifa || 0 : 0; repLines(r).forEach(function (l) { var o = items[l.key] || (items[l.key] = { h: 0, c: 0, label: l.label, apoyo: l.apoyo }); o.h += l.h; o.c += l.h * t; }); });
  var H = rows.reduce(function (a, r) { return a + r.hours; }, 0), L2 = rows.reduce(function (a, r) { return a + r.liters; }, 0), C = rows.reduce(function (a, r) { return a + r.cost; }, 0);
  return { rs: rs, rows: rows, items: items, H: H, L: L2, C: C };
}
function supNames() {
  if (S.sup._nm) return S.sup._nm;
  var c = S.sup.catalog || { works: [], items: {} }, w = {}; (c.works || []).forEach(function (x) { w[x.id] = x.name; });
  return (S.sup._nm = { w: w, i: c.items || {} });
}
function lineKey(l) { var n = supNames(); return l.i ? { key: 'i:' + l.i, label: (n.i[l.i] && n.i[l.i].name) || l.i, apoyo: false } : { key: 'w:' + l.w, label: (n.w[l.w] || l.w), apoyo: true }; }
function lineText(l) { var n = supNames(), w = n.w[l.w] || l.w; return w + (l.i ? ' → ' + ((n.i[l.i] && n.i[l.i].name) || l.i) : '') + (l.pi ? ' [' + l.pi + ' a ' + l.pf + ']' : ''); }
function repLines(r) { // líneas de un informe: formato nuevo o, si es viejo, los trabajos de la lista anterior
  if (r.lines && r.lines.length) return r.lines.map(function (l) { var k = lineKey(l); return { key: k.key, label: k.label, apoyo: k.apoyo, text: lineText(l), h: l.h }; });
  return Object.keys(r.items || {}).map(function (k) { return { key: 'o:' + k, label: ITEM_N[k] || k, apoyo: false, text: ITEM_N[k] || k, h: r.items[k] }; });
}
function bars(rows, fmtv, max) {
  var mx = max || Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([0.0001]));
  return rows.map(function (r) { return '<div class="brow"><span class="lb" title="' + esc(r.l) + '">' + esc(r.l) + '</span><span class="track"><span class="fill" style="width:' + Math.max(r.v / mx * 100, r.v > 0 ? 1.5 : 0) + '%"></span></span><span class="vl">' + fmtv(r.v) + '</span></div>'; }).join('') || '<p class="muted small">Sin datos en este período.</p>';
}
var EX_MODES = [['maq', 'Por máquina'], ['item', 'Por ítem'], ['op', 'Por operador'], ['av', 'Novedades']];
function supView() {
  var tabs = [['panel', 'Panel'], ['explorar', 'Explorar'], ['informes', 'Informes'], ['solicitudes', 'Solicitudes']];
  var rev = S.sup.reports.filter(function (r) { return r.status === 'validar'; }).length, pend = S.sup.requests.filter(function (r) { return r.status === 'pendiente'; }).length;
  var badge = { informes: rev, solicitudes: pend };
  var h = '<nav class="nav" aria-label="Secciones">' + tabs.map(function (t) { return '<button data-act="tab" data-t="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + (badge[t[0]] ? '<span class="pill warn">' + badge[t[0]] + '</span>' : '') + '</button>'; }).join('') + '<button data-act="refresh" style="margin-left:auto">Actualizar</button></nav>';
  h += '<div' + (S.supLoading ? ' class="loading"' : '') + '>';
  if (S.tab === 'panel') h += filtersHTML(false) + panelView();
  else if (S.tab === 'explorar') h += exploreView();
  else if (S.tab === 'informes') h += filtersHTML(true) + informesView();
  else h += solicitudesView();
  return h + '</div>';
}
function periodHTML() {
  var f = S.f;
  return '<label>Desde<input type="date" id="fl-from" data-in="ffrom" value="' + f.from + '"></label><label>Hasta<input type="date" id="fl-to" data-in="fto" value="' + f.to + '"></label>';
}
function rangeBtns() { return '<div style="display:flex;gap:6px"><button class="btn sm" data-act="range" data-d="7">7 días</button><button class="btn sm" data-act="range" data-d="30">30 días</button><button class="btn sm" data-act="range" data-d="0">Este mes</button></div>'; }
function filtersHTML(withM) {
  var f = S.f;
  return '<div class="filters">' + periodHTML() + (withM ? '<label>Máquina<select id="fl-m" data-in="fm"><option value="all">Todas</option>' + S.sup.machines.map(function (m) { return '<option value="' + esc(m.id) + '"' + (f.machine === m.id ? ' selected' : '') + '>' + esc(m.code) + ' · ' + esc(m.name) + '</option>'; }).join('') + '</select></label>' : '') + rangeBtns() + '</div>';
}
function dayList() {
  var out = [], f = S.f, a = f.from, b = f.to; if (a > b) return out;
  var d = b, n = 0; while (d >= a && n < 14) { out.unshift(d); d = addDays(d, -1); n++; }
  return out;
}
function opsOfMachine(id) { return S.sup.operators.filter(function (o) { return o.machineId === id; }); }
function panelView() {
  var s = stats('all'), cfg = S.sup.config, t = today(), h = '';
  var assigned = {}; S.sup.operators.forEach(function (o) { if (o.machineId) assigned[o.machineId] = 1; });
  var hoyRep = {}; S.sup.reports.forEach(function (r) { if (r.date === t) hoyRep[r.machineId] = 1; });
  var hoyOk = S.f.to >= t;
  var expected = S.sup.machines.filter(function (m) { return assigned[m.id] || hoyRep[m.id]; });
  var con = expected.filter(function (m) { return hoyRep[m.id]; }).length, sin = expected.filter(function (m) { return !hoyRep[m.id]; });
  var lph = s.H > 0 && s.L > 0 ? s.L / s.H : null;
  h += '<div class="kpis"><div class="kpi"><span class="eyebrow">Horas trabajadas</span><span class="v">' + fmt(s.H) + '<small>h</small></span></div><div class="kpi"><span class="eyebrow">Máquinas con informe hoy</span><span class="v">' + (hoyOk ? con + '<small>de ' + expected.length + '</small>' : '—') + '</span></div><div class="kpi"><span class="eyebrow">Combustible cargado</span><span class="v">' + fmt(s.L, 0) + '<small>L</small></span></div><div class="kpi"><span class="eyebrow">Consumo medio</span><span class="v">' + (lph ? fmt(lph) : '—') + '<small>L/h</small></span></div><div class="kpi"><span class="eyebrow">Costo estimado</span><span class="v">' + (s.C >= 1e6 ? '₲ ' + fmt(s.C / 1e6, 1) + '<small>M</small>' : gs(s.C)) + '</span></div></div>';
  // para revisar
  var rev = S.sup.reports.filter(function (r) { return r.status === 'validar'; }).length, pend = S.sup.requests.filter(function (r) { return r.status === 'pendiente'; }).length;
  var desde7 = addDays(t, -6), av7 = S.sup.reports.filter(function (r) { return r.nov && r.nov.t === 'averia' && r.date >= desde7; }).length;
  function rv(n, txt, act, lbl, d) { return '<div class="rv' + (n ? '' : ' zero') + '"><span class="pill ' + (n ? (act === 'goav' ? 'crit' : 'warn') : '') + '">' + n + '</span><span>' + txt + '</span>' + (n ? '<button class="link" data-act="' + act + '"' + (d || '') + '>' + lbl + '</button>' : '') + '</div>'; }
  var rvh = rv(rev, 'informes marcados a revisar', 'tab" data-t="informes', 'Ver') + rv(pend, 'solicitudes de máquina pendientes', 'tab" data-t="solicitudes', 'Ver') + rv(av7, 'fallas mecánicas en los últimos 7 días', 'goav', 'Ver') + (hoyOk ? rv(sin.length, 'máquinas sin informe hoy', 'miss', S.showMiss ? 'Ocultar' : 'Ver cuáles') : '');
  if (S.showMiss && hoyOk) rvh += '<div class="chips" style="margin-top:4px">' + sin.map(function (m) { var o = opsOfMachine(m.id)[0]; return '<span class="pill" title="' + esc(o ? o.name : '') + '">' + esc(m.code) + (o ? ' · ' + esc(o.name.split(' ')[0]) : '') + '</span>'; }).join('') + '</div>';
  var cardRev = '<section class="panel alert"><h2>Para revisar</h2><div class="sub">Lo que necesita tu atención ahora</div>' + rvh + '</section>';
  // horas por día
  var days = dayList(), byDay = {}; S.sup.reports.forEach(function (r) { byDay[r.date] = (byDay[r.date] || 0) + r.hours; });
  var mxd = Math.max.apply(null, days.map(function (d) { return byDay[d] || 0; }).concat([1]));
  var cardDay = '<section class="panel"><h2>Horas por día</h2><div class="sub">Todas las máquinas · ' + (days.length >= 14 ? 'últimos 14 días del período' : days.length + ' día' + (days.length === 1 ? '' : 's')) + '</div><div class="vbars">' + days.map(function (d) { var v = byDay[d] || 0, p = d.split('-'), wd = new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-PY', { weekday: 'short' }).slice(0, 3); return '<div class="vb" title="' + esc(dmy(d)) + ': ' + fmt(v) + ' h"><span class="vbar" style="height:' + (v ? Math.max(v / mxd * 100, 3) : 0) + '%"></span><span class="vlb">' + esc(wd) + '<br>' + (+p[2]) + '</span></div>'; }).join('') + '</div></section>';
  // ítems y máquinas
  var byI = Object.keys(s.items).map(function (k) { return { l: s.items[k].label + (s.items[k].apoyo ? ' (apoyo)' : ''), v: s.items[k].h }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6);
  var cardItem = '<section class="panel"><h2>Horas por ítem del certificado</h2><div class="sub">Los 6 con más horas</div>' + bars(byI, function (v) { return fmt(v) + ' h'; }) + '<button class="link" data-act="goex" data-m="item" style="margin-top:10px">Ver todos los ítems →</button></section>';
  var byM = s.rows.slice().sort(function (a, b) { return b.hours - a.hours; }).slice(0, 6).filter(function (r) { return r.hours > 0; }).map(function (r) { return { l: r.m.code, v: r.hours }; });
  var cardMaq = '<section class="panel"><h2>Máquinas con más horas</h2><div class="sub">Las 6 primeras</div>' + bars(byM, function (v) { return fmt(v) + ' h'; }) + '<button class="link" data-act="goex" data-m="maq" style="margin-top:10px">Ver todas las máquinas →</button></section>';
  // combustible fuera de lo normal
  var fz = s.rows.filter(function (r) { return r.lph && r.ref; }).map(function (r) { return { r: r, d: r.lph / r.ref - 1 }; }).filter(function (x) { return x.d > 0.15 || x.d < -0.25; }).sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); }).slice(0, 4);
  var fh = fz.map(function (x) { var r = x.r, up = x.d > 0; return '<div class="fz"><div><b class="mono">' + esc(r.m.code) + '</b><div class="muted small">' + fmt(r.lph) + ' L/h · referencia ' + fmt(r.ref, 0) + '</div></div><span class="pill ' + (up ? 'warn' : 'info') + '">' + (up ? '▲ +' : '▼ −') + fmt(Math.abs(x.d) * 100, 0) + ' %</span></div>'; }).join('') || '<p class="muted small">Ningún consumo fuera de lo normal en este período.</p>';
  var cardFuel = '<section class="panel"><h2>Combustible fuera de lo normal</h2><div class="sub">Consumo real contra referencia</div>' + fh + '</section>';
  // utilización por tipo
  var ty = {}; s.rows.forEach(function (r) { var k = r.m.name || 'Otras', o = ty[k] || (ty[k] = { h: 0, n: 0, p: 0 }); o.h += r.hours; o.n++; o.p += workdays(S.f.from, S.f.to) * (cfg.shiftHours || 9); });
  var util = Object.keys(ty).map(function (k) { return { l: k, v: ty[k].p ? ty[k].h / ty[k].p * 100 : 0 }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6);
  var cardUtil = '<section class="panel"><h2>Utilización</h2><div class="sub">Horas trabajadas ÷ horas programadas (' + fmt(cfg.shiftHours || 9, 0) + ' h por día, lunes a sábado)</div>' + bars(util, function (v) { return fmt(v, 0) + ' %'; }, 100) + '</section>';
  h += '<div class="panels">' + cardRev + cardDay + cardItem + cardMaq + cardFuel + cardUtil + '</div>';
  h += '<p class="muted small" style="margin-top:10px">Costo = horas × tarifa horaria de la máquina + litros × precio del combustible. Para cambiar tarifas, consumos de referencia, máquinas u operadores, editá las hojas de la planilla de Google y tocá «Actualizar».</p>';
  return h;
}

/* ---- Explorar: filtrar y buscar lo que uno busca ---- */
var EX_INF = [['all', 'Todos'], ['A', 'A · Asfalto'], ['B', 'B · Conformación'], ['C', 'C · Mov. de suelos'], ['D', 'D · Transporte']];
function exTipos() {
  if (S.ex.mode === 'av') return [['all', 'Todas'], ['disp', 'A disposición'], ['averia', 'Falla mecánica'], ['lluvia', 'Lluvia'], ['material', 'Falta de material'], ['otra', 'Otra']];
  var seen = {}, out = [['all', 'Todos']]; S.sup.machines.forEach(function (m) { if (m.name && !seen[m.name]) { seen[m.name] = 1; out.push([m.name, m.name]); } });
  return out;
}
function exploreView() {
  var e = S.ex, h = '<div class="tabs2 four">' + EX_MODES.map(function (m) { return '<button data-act="exmode" data-m="' + m[0] + '" aria-pressed="' + (e.mode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>';
  var ph = { maq: 'Código, tipo o nombre del operador', item: 'Nombre del ítem', op: 'Nombre del operador', av: 'Máquina, operador o detalle' }[e.mode];
  h += '<div class="filters" style="margin-top:14px"><label style="flex:1;min-width:12rem">Buscar<input type="search" id="exq" data-in="exq" placeholder="' + ph + '" value="' + esc(e.q) + '" autocomplete="off"></label>' + periodHTML();
  h += '<label>Informe<select data-in="exinf">' + EX_INF.map(function (x) { return '<option value="' + x[0] + '"' + (e.inf === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>';
  if (e.mode === 'maq' || e.mode === 'av') h += '<label>' + (e.mode === 'av' ? 'Novedad' : 'Tipo') + '<select data-in="extipo">' + exTipos().map(function (x) { return '<option value="' + esc(x[0]) + '"' + (e.tipo === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>';
  h += rangeBtns() + '</div><div id="exres">' + exResults() + '</div>';
  return h;
}
function exReps() { var e = S.ex; return S.sup.reports.filter(function (r) { return e.inf === 'all' || r.inf === e.inf; }); }
function lowQ() { return S.ex.q.trim().toLowerCase(); }
function exBuild() {
  var e = S.ex, q = lowQ(), reps = exReps(), f = S.f, wd = workdays(f.from, f.to), sh = S.sup.config.shiftHours || 9, fp = S.sup.config.fuelPrice || 0, cols, rows;
  if (e.mode === 'maq') {
    cols = [
      { k: 'code', l: 'Máquina', t: function (r) { return r.m.code; }, h: function (r) { var o = opsOfMachine(r.m.id).map(function (x) { return x.name; }).join(', '); return '<b>' + esc(r.m.code) + '</b><div class="muted small">' + esc(r.m.name) + (o ? ' · ' + esc(o) : '') + '</div>'; } },
      { k: 'inf', l: 'Inf.', t: function (r) { return r.m.inf || '—'; } },
      { k: 'days', l: 'Días', n: 1, t: function (r) { return r.days; }, f: function (v) { return v; } },
      { k: 'hours', l: 'Horas', n: 1, t: function (r) { return r.hours; }, f: function (v) { return fmt(v); }, b: 1 },
      { k: 'hpd', l: 'Hs/día', n: 1, t: function (r) { return r.hpd; }, f: function (v) { return fmt(v); } },
      { k: 'util', l: 'Utiliz.', n: 1, t: function (r) { return r.util; }, f: function (v) { return fmt(v * 100, 0) + ' %'; } },
      { k: 'liters', l: 'Litros', n: 1, t: function (r) { return r.liters; }, f: function (v) { return fmt(v, 0); } },
      { k: 'lph', l: 'L/h', n: 1, t: function (r) { return r.lph || 0; }, f: function (v) { return v ? fmt(v) : '—'; } },
      { k: 'stop', l: 'H parada', n: 1, t: function (r) { return r.stop; }, f: function (v) { return v ? fmt(v) : '—'; } },
      { k: 'cost', l: 'Costo', n: 1, t: function (r) { return r.cost; }, f: function (v) { return gs(v); } }
    ];
    rows = S.sup.machines.filter(function (m) {
      if (e.inf !== 'all' && m.inf !== e.inf) return false; if (e.tipo !== 'all' && m.name !== e.tipo) return false;
      if (q) { var txt = (m.code + ' ' + m.name + ' ' + opsOfMachine(m.id).map(function (o) { return o.name; }).join(' ')).toLowerCase(); if (txt.indexOf(q) < 0) return false; }
      return true;
    }).map(function (m) {
      var x = reps.filter(function (r) { return r.machineId === m.id; }), days = {}, hh = 0, L = 0, st = 0;
      x.forEach(function (r) { days[r.date] = 1; hh += r.hours; if (r.fuel) L += r.fuel.liters; if (r.nov) st += r.nov.stop || 0; });
      var nd = Object.keys(days).length, prog = wd * sh;
      return { key: m.id, m: m, days: nd, hours: hh, liters: L, lph: hh > 0 && L > 0 ? L / hh : 0, hpd: nd ? hh / nd : 0, util: prog ? hh / prog : 0, stop: st, cost: hh * (m.tarifa || 0) + L * fp, reps: x };
    });
  } else if (e.mode === 'item') {
    var mp = {}, byM = {}; S.sup.machines.forEach(function (m) { byM[m.id] = m; });
    reps.forEach(function (r) { var t = (byM[r.machineId] || {}).tarifa || 0; repLines(r).forEach(function (l) { var o = mp[l.key] || (mp[l.key] = { key: l.key, label: l.label, apoyo: l.apoyo, h: 0, c: 0, ms: {}, en: [] }); o.h += l.h; o.c += l.h * t; o.ms[r.machineId] = 1; o.en.push({ r: r, l: l }); }); });
    var tot = Object.keys(mp).reduce(function (a, k) { return a + mp[k].h; }, 0);
    cols = [
      { k: 'label', l: 'Ítem', t: function (r) { return r.label; }, h: function (r) { return esc(r.label) + (r.apoyo ? ' <span class="muted small">(apoyo, sin ítem)</span>' : ''); } },
      { k: 'h', l: 'Horas', n: 1, t: function (r) { return r.h; }, f: function (v) { return fmt(v); }, b: 1 },
      { k: 'pct', l: '% del total', n: 1, t: function (r) { return tot ? r.h / tot : 0; }, f: function (v) { return fmt(v * 100, 0) + ' %'; } },
      { k: 'nm', l: 'Máquinas', n: 1, t: function (r) { return Object.keys(r.ms).length; }, f: function (v) { return v; } },
      { k: 'ne', l: 'Registros', n: 1, t: function (r) { return r.en.length; }, f: function (v) { return v; } },
      { k: 'c', l: 'Costo de máquina', n: 1, t: function (r) { return r.c; }, f: function (v) { return gs(v); } }
    ];
    rows = Object.keys(mp).map(function (k) { return mp[k]; }).filter(function (o) { return !q || o.label.toLowerCase().indexOf(q) > -1; });
  } else if (e.mode === 'op') {
    cols = [
      { k: 'name', l: 'Operador', t: function (r) { return r.name; }, h: function (r) { return '<b>' + esc(r.name) + '</b>'; } },
      { k: 'mach', l: 'Máquina', t: function (r) { return r.mach; }, h: function (r) { return '<span class="mono">' + esc(r.mach || '—') + '</span>'; } },
      { k: 'days', l: 'Días', n: 1, t: function (r) { return r.days; }, f: function (v) { return v; } },
      { k: 'hours', l: 'Horas', n: 1, t: function (r) { return r.hours; }, f: function (v) { return fmt(v); }, b: 1 },
      { k: 'liters', l: 'Litros', n: 1, t: function (r) { return r.liters; }, f: function (v) { return fmt(v, 0); } },
      { k: 'nov', l: 'Novedades', n: 1, t: function (r) { return r.nov; }, f: function (v) { return v || '—'; } },
      { k: 'last', l: 'Último informe', n: 1, t: function (r) { return r.last; }, f: function (v) { return v ? dmy(v) : 'Nunca'; } }
    ];
    var ops = {}; S.sup.operators.forEach(function (o) { ops[o.id] = { key: o.id, name: o.name, mach: S.machines[o.machineId] ? S.machines[o.machineId].code : (S.sup.machines.filter(function (m) { return m.id === o.machineId; })[0] || {}).code || '', days: 0, hours: 0, liters: 0, nov: 0, last: '', reps: [], d: {} }; });
    reps.forEach(function (r) { var o = ops[r.operatorId] || (ops[r.operatorId] = { key: r.operatorId, name: r.operatorName, mach: r.machineCode, days: 0, hours: 0, liters: 0, nov: 0, last: '', reps: [], d: {} }); o.d[r.date] = 1; o.hours += r.hours; if (r.fuel) o.liters += r.fuel.liters; if (r.nov) o.nov++; if (r.date > o.last) o.last = r.date; o.reps.push(r); });
    rows = Object.keys(ops).map(function (k) { var o = ops[k]; o.days = Object.keys(o.d).length; return o; }).filter(function (o) { return !q || (o.name + ' ' + o.mach).toLowerCase().indexOf(q) > -1; });
  } else {
    cols = [
      { k: 'date', l: 'Fecha', t: function (r) { return r.date; }, h: function (r) { return esc(dmy(r.date)); } },
      { k: 'code', l: 'Máquina', t: function (r) { return r.machineCode; }, h: function (r) { return '<b>' + esc(r.machineCode) + '</b>'; } },
      { k: 'op', l: 'Operador', t: function (r) { return r.operatorName; } },
      { k: 'nov', l: 'Novedad', t: function (r) { return novText({ t: r.nov.t, sub: r.nov.sub, stop: 0 }); }, h: function (r) { return '<span class="pill ' + (r.nov.t === 'averia' ? 'crit' : 'warn') + '">' + esc(novText({ t: r.nov.t, sub: r.nov.sub, stop: 0 })) + '</span>'; } },
      { k: 'stop', l: 'H parada', n: 1, t: function (r) { return r.nov.stop || 0; }, f: function (v) { return v ? fmt(v) : '—'; }, b: 1 },
      { k: 'notes', l: 'Detalle', t: function (r) { return r.notes || ''; }, h: function (r) { return '<span class="small">' + esc(r.notes || '') + '</span>'; } }
    ];
    rows = reps.filter(function (r) { return r.nov && (e.tipo === 'all' || (e.tipo === 'disp' ? !!r.nov.disp : r.nov.t === e.tipo)) && (!q || (r.machineCode + ' ' + r.operatorName + ' ' + (r.notes || '')).toLowerCase().indexOf(q) > -1); }).map(function (r) { return Object.assign({ key: r.id }, r); });
  }
  return { cols: cols, rows: rows };
}
function exSorted(b) {
  var e = S.ex, s = e.sort[e.mode], col = b.cols.filter(function (c) { return c.k === s[0]; })[0] || b.cols[0], d = s[1];
  return b.rows.slice().sort(function (x, y) { var a = col.t(x), c = col.t(y), r = typeof a === 'number' ? a - c : String(a).localeCompare(String(c), 'es', { numeric: true }); return r * d; });
}
function repMini(list, withCode) {
  if (!list.length) return '<p class="muted small" style="margin:0">Sin informes en este período.</p>';
  return '<div class="xrep">' + list.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 12).map(function (r) {
    var rl = repLines(r), chips = rl.map(function (l) { return '<span class="pill">' + esc(l.text) + (rl.length > 1 ? ' · ' + fmt(l.h) : '') + '</span>'; }).join('');
    return '<div class="xr1"><span>' + esc(dmy(r.date)) + '</span><span>' + esc(r.operatorName) + (withCode && r.machineCode ? ' <span class="mono muted">' + esc(r.machineCode) + '</span>' : '') + '</span><span class="mono">' + (r.hours > 0 ? fmt(r.hours) + ' h' : '—') + '</span><span class="chips">' + chips + (r.nov ? '<span class="pill ' + (r.nov.t === 'averia' ? 'crit' : 'warn') + '">' + esc(novText(r.nov)) + '</span>' : '') + '</span><span class="mono">' + (r.fuel ? fmt(r.fuel.liters, 0) + ' L' : '') + '</span></div>';
  }).join('') + '</div>';
}
function exDetail(row) {
  var e = S.ex;
  if (e.mode === 'maq' || e.mode === 'op') return '<div class="muted small" style="margin-bottom:6px"><b>' + esc(e.mode === 'maq' ? row.m.code : row.name) + '</b> · últimos informes</div>' + repMini(row.reps, e.mode === 'op');
  var ms = {}; row.en.forEach(function (x) { var o = ms[x.r.machineId] || (ms[x.r.machineId] = { code: x.r.machineCode, h: 0 }); o.h += x.l.h; });
  var top = Object.keys(ms).map(function (k) { return ms[k]; }).sort(function (a, b) { return b.h - a.h; }).map(function (o) { return '<span class="pill">' + esc(o.code) + ' · ' + fmt(o.h) + ' h</span>'; }).join('');
  var lst = row.en.slice().sort(function (a, b) { return b.r.date.localeCompare(a.r.date); }).slice(0, 12).map(function (x) { return '<div class="xr1 i"><span>' + esc(dmy(x.r.date)) + '</span><span>' + esc(x.r.operatorName) + ' <span class="mono muted">' + esc(x.r.machineCode) + '</span></span><span class="mono">' + fmt(x.l.h) + ' h</span><span class="small">' + esc(x.l.text) + '</span></div>'; }).join('');
  return '<div class="muted small" style="margin-bottom:6px"><b>' + esc(row.label) + '</b> · horas por máquina</div><div class="chips" style="margin-bottom:10px">' + top + '</div><div class="xrep">' + lst + '</div>';
}
function exResults() {
  var e = S.ex, b = exBuild(), rows = exSorted(b), tot = rows.length, shown = rows.slice(0, e.shown), s = e.sort[e.mode], nc = b.cols.length + (e.mode === 'av' ? 0 : 1);
  var h = '<p class="muted small" style="margin:4px 0 10px">' + tot + ' ' + ({ maq: 'máquina', item: 'ítem', op: 'operador', av: 'novedad' }[e.mode]) + (tot === 1 ? '' : (e.mode === 'maq' || e.mode === 'op' ? 'es' : (e.mode === 'item' ? 's' : 'es'))) + (e.q.trim() ? ' que coinciden con “' + esc(e.q.trim()) + '”' : '') + (e.mode === 'av' ? '' : ' · tocá una fila para ver el detalle') + ' · tocá un título para ordenar</p>';
  if (e.mode === 'av') {
    var hp = 0, per = {}; rows.forEach(function (r) { hp += r.nov.stop || 0; per[r.machineCode] = (per[r.machineCode] || 0) + (r.nov.stop || 0); });
    var worst = Object.keys(per).sort(function (a, c) { return per[c] - per[a]; })[0];
    if (tot) h += '<div class="kpis" style="margin-bottom:14px"><div class="kpi"><span class="eyebrow">Novedades</span><span class="v">' + tot + '</span></div><div class="kpi"><span class="eyebrow">Horas de parada</span><span class="v">' + fmt(hp) + '<small>h</small></span></div><div class="kpi"><span class="eyebrow">Más paradas</span><span class="v">' + esc(worst || '—') + '</span></div></div>';
  }
  h += '<div class="tblw"><table class="ex"><thead><tr>' + b.cols.map(function (c) { return '<th class="' + (c.n ? 'n ' : '') + 'sortable" data-act="exsort" data-k="' + c.k + '">' + esc(c.l) + (s[0] === c.k ? (s[1] < 0 ? ' ↓' : ' ↑') : '') + '</th>'; }).join('') + (e.mode === 'av' ? '' : '<th></th>') + '</tr></thead><tbody>';
  h += shown.map(function (r) {
    var open = e.open === r.key && e.mode !== 'av';
    var tr = '<tr' + (e.mode === 'av' ? '' : ' class="xrow' + (open ? ' open' : '') + '" data-act="exopen" data-k="' + esc(r.key) + '"') + '>' + b.cols.map(function (c) { var v = c.t(r); return '<td class="' + (c.n ? 'n' : '') + '">' + (c.h ? c.h(r) : (c.f ? (c.b ? '<b>' + c.f(v) + '</b>' : c.f(v)) : esc(v))) + '</td>'; }).join('') + (e.mode === 'av' ? '' : '<td class="car">' + (open ? '▾' : '▸') + '</td>') + '</tr>';
    if (open) tr += '<tr class="xd"><td colspan="' + nc + '">' + exDetail(r) + '</td></tr>';
    return tr;
  }).join('') || '<tr><td colspan="' + nc + '" class="muted">No hay resultados con estos filtros.</td></tr>';
  h += '</tbody></table></div><div class="exfoot"><span class="muted small">Mostrando ' + shown.length + ' de ' + tot + '</span><span style="display:flex;gap:8px">' + (tot > shown.length ? '<button class="btn sm" data-act="exmore">Mostrar más</button>' : '') + '<button class="btn sm" data-act="excsv">Descargar CSV</button></span></div>';
  return h;
}
function exCsv() {
  var b = exBuild(), rows = exSorted(b), e = S.ex;
  var head = b.cols.map(function (c) { return c.l; });
  var data = rows.map(function (r) { return b.cols.map(function (c) { var v = c.t(r); return typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : v; }); });
  downloadCsv([head].concat(data), 'explorar-' + e.mode + '-' + S.f.from + '_' + S.f.to + '.csv');
}
function stPill(r) { return r.status === 'validar' ? '<span class="pill warn">A revisar</span>' : '<span class="pill ok">Válido</span>'; }
function informesView() {
  var rs = filt().slice().sort(function (a, b) { return b.date.localeCompare(a.date); }), lim = rs.slice(0, 150);
  var h = '<div class="sec" style="margin-top:0"><h2>Informes (' + rs.length + ')</h2><button class="btn sm" data-act="csv">Descargar CSV</button></div><div class="tblw"><table><thead><tr><th>Fecha</th><th>Máquina</th><th>Operador</th><th class="n">Horómetro</th><th class="n">Horas</th><th>Trabajos</th><th class="n">Combustible</th><th>Estado</th></tr></thead><tbody>';
  h += lim.map(function (r) {
    var rl = repLines(r), chips = rl.map(function (l) { return '<span class="pill">' + esc(l.text) + (rl.length > 1 ? ' · ' + fmt(l.h) : '') + '</span>'; }).join('') || '<span class="muted small">Sin trabajo</span>';
    var nv = r.nov ? '<div style="margin-top:4px"><span class="pill ' + (r.nov.t === 'averia' ? 'crit' : 'warn') + '">' + esc(novText(r.nov)) + '</span></div>' : '';
    var ex = r.status === 'validar' ? '<div class="small" style="color:var(--warn);margin-top:4px">' + esc((r.flags || []).join('; ')) + '</div>' + (r.notes ? '<div class="small muted">' + esc(r.notes) + '</div>' : '') + '<button class="btn sm" style="margin-top:6px" data-act="valid" data-id="' + esc(r.id) + '">Dar por válido</button>' : (r.notes ? '<div class="small muted" style="margin-top:4px">' + esc(r.notes) + '</div>' : '');
    return '<tr><td style="white-space:nowrap">' + esc(dmy(r.date)) + '<div class="muted small mono">' + esc(comprobante(r.id)) + '</div></td><td><b>' + esc(r.machineCode) + '</b></td><td>' + esc(r.operatorName) + '</td><td class="n">' + fmt(r.hIni) + ' → ' + fmt(r.hFin) + '</td><td class="n">' + fmt(r.hours) + '</td><td><div class="chips">' + chips + '</div>' + nv + '</td><td class="n">' + (r.fuel ? fmt(r.fuel.liters, 0) + ' L' : '—') + '</td><td>' + stPill(r) + ex + '</td></tr>';
  }).join('') || '<tr><td colspan="8" class="muted">No hay informes en este período.</td></tr>';
  return h + '</tbody></table></div>' + (rs.length > 150 ? '<p class="muted small">Se muestran los 150 más recientes. El CSV incluye todos.</p>' : '');
}
function solicitudesView() {
  var all = S.sup.requests.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }), p = all.filter(function (r) { return r.status === 'pendiente'; }), d = all.filter(function (r) { return r.status !== 'pendiente'; }).slice(0, 20);
  var h = '<div class="sec" style="margin-top:0"><h2>Pendientes</h2></div>';
  h += p.length ? '<div class="stack tight">' + p.map(function (r) { var op = null; S.sup.operators.forEach(function (o) { if (o.id === r.operatorId) op = o; }); return '<div class="card" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center"><div><b>' + esc(r.operatorName) + '</b> pide <b class="mono">' + esc(r.machineCode) + '</b><div class="small muted">' + esc(dlong(r.date)) + (r.reason ? ' · ' + esc(r.reason) : '') + (op && op.machineId ? ' · asignado a ' + esc(S.sup.machines.filter(function (m) { return m.id === op.machineId; }).map(function (m) { return m.code; }).join('')) : '') + '</div></div><div style="display:flex;gap:8px"><button class="btn sm" data-act="decide" data-id="' + esc(r.id) + '" data-v="rechazada">Rechazar</button><button class="btn sm primary" data-act="decide" data-id="' + esc(r.id) + '" data-v="aprobada">Aprobar</button></div></div>'; }).join('') + '</div>' : '<p class="muted">No hay solicitudes pendientes.</p>';
  h += '<div class="sec"><h2>Historial</h2></div><div class="tblw"><table><thead><tr><th>Fecha</th><th>Operador</th><th>Máquina</th><th>Estado</th></tr></thead><tbody>' + (d.map(function (r) { return '<tr><td>' + esc(dmy(r.date)) + '</td><td>' + esc(r.operatorName) + '</td><td><b>' + esc(r.machineCode) + '</b></td><td><span class="pill ' + (r.status === 'aprobada' ? 'ok' : 'crit') + '">' + (r.status === 'aprobada' ? 'Aprobada' : 'Rechazada') + '</span></td></tr>'; }).join('') || '<tr><td colspan="4" class="muted">Todavía no hay solicitudes resueltas.</td></tr>') + '</tbody></table></div><p class="muted small" style="margin-top:10px">Una autorización vale solo para el día del pedido.</p>';
  return h;
}
function downloadCsv(rows, name) {
  var q = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var blob = new Blob(['\ufeff' + rows.map(function (r) { return r.map(q).join(';'); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function csvExport() {
  var rows = [['Fecha', 'Máquina', 'Operador', 'Horómetro inicial', 'Horómetro final', 'Horas', 'Trabajos', 'Combustible', 'Litros', 'Horómetro de carga', 'Novedad', 'Horas de parada', 'Estado', 'Observaciones', 'Comprobante']];
  filt().slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (r) { rows.push([r.date, r.machineCode, r.operatorName, String(r.hIni).replace('.', ','), String(r.hFin).replace('.', ','), String(r.hours).replace('.', ','), repLines(r).map(function (l) { return l.text + ': ' + l.h; }).join(' | '), r.fuel ? r.fuel.type : '', r.fuel ? String(r.fuel.liters).replace('.', ',') : '', r.fuel ? String(r.fuel.horo).replace('.', ',') : '', r.nov ? novText({ t: r.nov.t, sub: r.nov.sub, stop: 0 }) : '', r.nov ? String(r.nov.stop || 0).replace('.', ',') : '', r.status === 'validar' ? 'A revisar' : 'Válido', r.notes || '', comprobante(r.id)]); });
  downloadCsv(rows, 'informes-maquinaria-' + S.f.from + '_' + S.f.to + '.csv');
}

/* ---------- acciones ---------- */
function exSet(mode) { var e = S.ex; e.mode = mode; e.q = ''; e.tipo = 'all'; e.open = null; e.shown = 15; render(); }
function exRefresh() { var el = document.getElementById('exres'); if (el) el.innerHTML = exResults(); }
function rework() { var el = document.getElementById('wblk'); if (el) el.innerHTML = worksHTML(); liveUpdate(); }
var act = {
  role: function (d) { S.login = newLogin(d.r); render(); },
  key: function (d) { keyPress(d.k); },
  docGo: docDone,
  back: function () { var L = S.login; if (L.busy) return; S.login = newLogin('op'); S.pendingSession = null; render(); },
  logout: function () { S.hist.list = []; S.hist.opId = ''; S.hist.open = null; S.session = null; S.pendingSession = null; S.sup = null; S.f = null; save(); S.login = newLogin('op'); go('login'); refreshBootstrap(); },
  home: function () { go('opHome'); },
  hist: function () { S.hist.open = null; S.hist.shown = 20; S.hist.err = ''; go('hist'); loadHist(); },
  hlist: function () { S.hist.open = null; go('hist'); },
  hopen: function (d) { S.hist.open = d.id; go('hist'); },
  hrange: function (d) { S.hist.range = d.v; S.hist.shown = 20; render(); },
  hmore: function () { S.hist.shown += 20; render(); },
  share: function (d) { shareReport(d.id); },
  nov: function (d) { var N = S.form.nov; N.t = d.v; if (d.v !== 'averia') N.sub = ''; if (!d.v) N.stop = ''; var el = document.getElementById('novblk'); if (el) el.innerHTML = novHTML(); liveUpdate(); },
  disp: function (d) { var F = S.form; F.disp = d.v === '1'; F.nov = { t: '', sub: '', stop: '' }; if (F.disp) { F.works = []; F.pick = {}; F.prog = {}; F.hrs = {}; F.hrsEdited = false; F.hFin = ''; } render(); },
  dreason: function (d) { var N = S.form.nov; N.t = d.v; if (d.v !== 'averia') N.sub = ''; N.stop = ''; render(); },
  novsub: function (d) { S.form.nov.sub = d.v; if (S.form.disp) { render(); return; } var el = document.getElementById('novblk'); if (el) el.innerHTML = novHTML(); },
  syncnow: function () { toast('Enviando…'); syncNow(); },
  discard: function (d) { S.failed = S.failed.filter(function (f) { return f.r.id !== d.id; }); save(); render(); },
  otra: function () { S.reqPick = null; S.reqNote = ''; go('otra'); },
  reqPick: function (d) { S.reqPick = d.m; render(); },
  reqSend: reqSend,
  newForm: function (d) { newForm(d.m); },
  fmach: function (d) { var m = S.machines[d.m]; var F = S.form; F.machineId = d.m; F.first = !(m.horo > 0); F.hIni = F.first ? '' : String(m.horo).replace('.', ','); F.unlock = F.first; F.works = []; F.pick = {}; F.prog = {}; F.hrs = {}; F.hrsEdited = false; render(); },
  unlock: function () { S.form.unlock = true; render(); var i = document.getElementById('f-hini'); if (i) i.focus(); },
  work: function (d) {
    var F = S.form, i = F.works.indexOf(d.w); if (i > -1) { F.works.splice(i, 1); delete F.pick[d.w]; } else F.works.push(d.w);
    F.hrsEdited = false; F.hrs = {}; rework();
  },
  witem: function (d) {
    var F = S.form, p = F.pick[d.w] || (F.pick[d.w] = {}); if (p[d.i]) delete p[d.i]; else p[d.i] = true;
    F.hrsEdited = false; F.hrs = {}; rework();
  },
  fuel: function (d) {
    var F = S.form; F.fuel = d.v === 'si';
    document.querySelectorAll('[data-act="fuel"]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.v === 'si') === F.fuel)); });
    document.getElementById('fuelf').hidden = !F.fuel;
    if (F.fuel && !F.fhoro && F.hFin) { F.fhoro = F.hFin; document.getElementById('f-fh').value = F.fhoro; }
  },
  ftype: function (d) { S.form.ftype = d.v; document.querySelectorAll('[data-act="ftype"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === d.v)); }); },
  send: submitForm,
  install: function () { if (installEv) { installEv.prompt(); installEv = null; render(); } },
  tab: function (d) { S.tab = d.t; render(); },
  refresh: loadSup,
  range: function (d) { var t = today(), n = +d.d; S.f.to = t; S.f.from = n ? addDays(t, -(n - 1)) : t.slice(0, 8) + '01'; loadSup(); },
  csv: csvExport,
  miss: function () { S.showMiss = !S.showMiss; render(); },
  goav: function () { S.tab = 'explorar'; exSet('av'); },
  goex: function (d) { S.tab = 'explorar'; exSet(d.m); },
  exmode: function (d) { exSet(d.m); },
  exopen: function (d) { S.ex.open = S.ex.open === d.k ? null : d.k; exRefresh(); },
  exsort: function (d) { var s = S.ex.sort[S.ex.mode]; if (s[0] === d.k) s[1] = -s[1]; else { s[0] = d.k; s[1] = /^(label|code|name|mach|inf|op|notes|date)$/.test(d.k) && d.k !== 'date' ? 1 : -1; } exRefresh(); },
  exmore: function () { S.ex.shown += 15; exRefresh(); },
  excsv: exCsv,
  valid: function (d) { api('supValidate', { pin: S.session.pinH, id: d.id }).then(function () { S.sup.reports.forEach(function (r) { if (r.id === d.id) r.status = 'ok'; }); render(); }).catch(supFail); },
  decide: function (d) { api('supRequest', { pin: S.session.pinH, id: d.id, status: d.v }).then(function () { S.sup.requests.forEach(function (r) { if (r.id === d.id) r.status = d.v; }); render(); }).catch(supFail); }
};
var inp = {
  date: function (v) { S.form.date = v; },
  hIni: function (v) { S.form.hIni = v; liveUpdate(); },
  hFin: function (v) { S.form.hFin = v; liveUpdate(); },
  hrs: function (v, el) { S.form.hrs[el.dataset.k] = v; S.form.hrsEdited = true; liveUpdate(); },
  liters: function (v) { S.form.liters = v; }, fhoro: function (v) { S.form.fhoro = v; }, notes: function (v) { S.form.notes = v; },
  reqNote: function (v) { S.reqNote = v; },
  exq: function (v) { S.ex.q = v; S.ex.shown = 15; S.ex.open = null; exRefresh(); },
  nstop: function (v) { S.form.nov.stop = v; liveUpdate(); },
  pa: function (v, el) { var p = S.form.prog[el.dataset.k] || (S.form.prog[el.dataset.k] = {}); p.a = v; },
  pb: function (v, el) { var p = S.form.prog[el.dataset.k] || (S.form.prog[el.dataset.k] = {}); p.b = v; }
};
var onchange = {
  ffrom: function (v) { if (v) { S.f.from = v; loadSup(); } }, fto: function (v) { if (v) { S.f.to = v; loadSup(); } }, fm: function (v) { S.f.machine = v; render(); },
  exinf: function (v) { S.ex.inf = v; S.ex.shown = 15; S.ex.open = null; render(); }, extipo: function (v) { S.ex.tipo = v; S.ex.shown = 15; S.ex.open = null; render(); }
};
function onClick(e) { var b = e.target.closest('[data-act]'); if (!b || b.disabled) return; var f = act[b.dataset.act]; if (f) f(b.dataset, b, e); }
app.addEventListener('click', onClick);
topEl.addEventListener('click', onClick); // el botón «Salir» está en la barra de arriba
app.addEventListener('input', function (e) { var t = e.target; if (t.dataset && t.dataset.in && inp[t.dataset.in]) inp[t.dataset.in](t.value, t); });
app.addEventListener('change', function (e) { var t = e.target; if (!t.dataset || !t.dataset.in) return; if (onchange[t.dataset.in]) onchange[t.dataset.in](t.value, t); else if (inp[t.dataset.in]) inp[t.dataset.in](t.value, t); });

/* ---------- arranque ---------- */
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEv = e; soft(); });
window.addEventListener('online', function () { S.net.lastErr = ''; syncNow(); refreshBootstrap(); });
window.addEventListener('offline', function () { soft(); });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { syncNow(); if (S.view === 'login') refreshBootstrap(); } });
setInterval(function () { if (S.session && S.session.role === 'op' && (mineQueue().length || S.net.lastErr)) syncNow(); }, 30000);
render();
/* pantalla de carga: se va cuando la app ya tiene sus datos (mínimo 0,7 s para que no parpadee) */
var splash = document.getElementById('splash'), splashT0 = Date.now();
function hideSplash() {
  var el = splash; if (!el) return; splash = null;
  setTimeout(function () { try { el.classList.add('off'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450); } catch (x) {} }, Math.max(0, 700 - (Date.now() - splashT0)));
}
if (CFG.API_URL && CFG.API_KEY) {
  var bp = refreshBootstrap();
  if (Object.keys(S.machines || {}).length) hideSplash(); else { bp.then(hideSplash); setTimeout(hideSplash, 8000); }
  bp.then(function () { if (S.session && S.session.role === 'op') syncNow(); });
} else hideSplash();
if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); }); }
if (window.__IED_TEST__) window.__IED_TEST__.hooks = { novText: novText, S: S, act: act, inp: inp, api: api, syncNow: syncNow, buildReport: buildReport, submitForm: submitForm, pinDone: pinDone, docDone: docDone, refreshBootstrap: refreshBootstrap, parseNum: parseNum, render: render, parseProg: parseProg, setCFG: function (c) { Object.assign(CFG, c); } };
})();
