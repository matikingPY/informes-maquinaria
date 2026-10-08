(function () {
'use strict';
var CFG = window.APP_CONFIG || {};
var SAL = ':ied1';
var ITEMS = [['limpieza','Limpieza y desbroce'],['destape','Destape de cantera'],['bolsones','Exc. de bolsones'],['exc_nc','Exc. no clasificada'],['zanja','Exc. zanja de drenaje'],['carga_prest','Carga de mat. en préstamo'],['carga_cant','Carga de mat. en cantera'],['carga_plant','Carga de mat. en plantas'],['limp_prest','Limpieza p/ préstamo'],['acopio','Trabajo en acopio'],['cantera','Trabajo en cantera'],['esp_terr','Esparcida de mat. (terraplén)'],['esp_bolson','Esparcida de mat. (exc. bolsón)'],['esp_nc','Esparcida de mat. (exc. no clasif.)'],['taludes','Arreglo de taludes'],['cachamba','Limpieza de cachamba'],['otros','Otros']];
var ITEM_N = {}; ITEMS.forEach(function (i) { ITEM_N[i[0]] = i[1]; });
var app = document.getElementById('app'), topEl = document.getElementById('top'), toastEl = document.getElementById('toast');
var LS = 'ied.v1', toastT = null, renderT = null, pending = false, installEv = null;

var saved = (function () { try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch (e) { return {}; } })();
// solo se conservan los operadores que ya entraron en este celular (no hay lista completa)
var knownDocs = saved.known || {};
var keepOps = {}; Object.keys(knownDocs).forEach(function (k) { keepOps[knownDocs[k]] = 1; }); if (saved.session && saved.session.opId) keepOps[saved.session.opId] = 1;
var localOps = {}; Object.keys(saved.operators || {}).forEach(function (id) { if (keepOps[id]) localOps[id] = saved.operators[id]; });
function newLogin(role) { return { role: role || 'op', step: 'doc', doc: '', opId: null, pin: '', first: null, err: '', busy: false }; }
var S = {
  machines: saved.machines || {}, operators: localOps, known: knownDocs, shift: saved.shift || 9, myReqs: saved.myReqs || [], myReqsDate: saved.myReqsDate || '',
  queue: saved.queue || [], failed: saved.failed || [], session: null, pendingSession: null, view: 'login', tab: 'panel',
  login: newLogin('op'), form: null, last: null, f: null, sup: null, supLoading: false,
  reqPick: null, reqNote: '', boot: 'wait', net: { syncing: false, lastErr: '' }
};
if (saved.session && saved.session.opId && S.operators[saved.session.opId]) {
  if (CFG.REQUIRE_PIN_ON_OPEN) { S.pendingSession = saved.session; S.login.opId = saved.session.opId; S.login.step = 'pin'; }
  else { S.session = saved.session; S.view = 'opHome'; }
}

function save() {
  try {
    localStorage.setItem(LS, JSON.stringify({ machines: S.machines, operators: S.operators, known: S.known, shift: S.shift, session: S.session && S.session.role === 'op' ? S.session : (S.pendingSession || null), myReqs: S.myReqs, myReqsDate: S.myReqsDate, queue: S.queue, failed: S.failed }));
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
var ICON = {
  ex: '<rect x="6" y="46" width="60" height="13" rx="6.5" fill="B"/><circle cx="14" cy="52.5" r="3.2" fill="H"/><circle cx="37" cy="52.5" r="3.2" fill="H"/><circle cx="58" cy="52.5" r="3.2" fill="H"/><rect x="14" y="31" width="42" height="14" rx="3" fill="B"/><path d="M18 31V19a2 2 0 0 1 2-2h14l8 14z" fill="A"/><path d="M23 29V21h9l5 8z" fill="H" opacity=".5"/><path d="M46 35L66 11l8 5" stroke="B" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M72 14l10 22" stroke="B" stroke-width="4" stroke-linecap="round"/><path d="M77 34h13l-3 13h-10z" fill="A"/>',
  tp: '<rect x="10" y="45" width="66" height="14" rx="7" fill="B"/><circle cx="19" cy="52" r="3.4" fill="H"/><circle cx="43" cy="52" r="3.4" fill="H"/><circle cx="67" cy="52" r="3.4" fill="H"/><rect x="22" y="31" width="46" height="14" rx="3" fill="B"/><path d="M30 31V16a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v15z" fill="A"/><path d="M34 28V19h12v9z" fill="H" opacity=".5"/><rect x="14" y="10" width="3" height="8" fill="B"/><path d="M68 44l16 4" stroke="B" stroke-width="4" stroke-linecap="round"/><path d="M84 28h6l2 28h-6z" fill="A"/>',
  mn: '<path d="M10 40h60" stroke="B" stroke-width="5" stroke-linecap="round"/><rect x="52" y="34" width="34" height="10" rx="3" fill="B"/><path d="M56 34V17a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v17z" fill="A"/><path d="M61 31V20h12v11z" fill="H" opacity=".5"/><circle cx="16" cy="48" r="10" fill="B"/><circle cx="16" cy="48" r="4" fill="H"/><circle cx="62" cy="50" r="9" fill="B"/><circle cx="62" cy="50" r="3.5" fill="H"/><circle cx="80" cy="50" r="9" fill="B"/><circle cx="80" cy="50" r="3.5" fill="H"/><path d="M34 42l4 10" stroke="B" stroke-width="3.5" stroke-linecap="round"/><rect x="26" y="52" width="26" height="5" rx="2" fill="A"/>',
  ta: '<path d="M44 34h34a3 3 0 0 1 3 3v9H44z" fill="B"/><path d="M26 34V17a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v17z" fill="A"/><path d="M30 31V20h10v11z" fill="H" opacity=".5"/><rect x="22" y="31" width="30" height="8" rx="2" fill="B"/><rect x="74" y="20" width="3" height="14" fill="B"/><circle cx="30" cy="46" r="16" fill="B"/><circle cx="30" cy="46" r="7" fill="H"/><circle cx="30" cy="46" r="3" fill="A"/><circle cx="74" cy="52" r="9" fill="B"/><circle cx="74" cy="52" r="3.5" fill="H"/>',
  vc: '<rect x="30" y="31" width="52" height="15" rx="3" fill="B"/><path d="M48 31V15a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16z" fill="A"/><path d="M53 28V18h10v10z" fill="H" opacity=".5"/><circle cx="22" cy="46" r="15" fill="B"/><circle cx="22" cy="46" r="6" fill="H"/><path d="M12 38l20 16M10 46h24M12 54l20-16" stroke="H" stroke-width="1.6" opacity=".5"/><circle cx="72" cy="52" r="9" fill="B"/><circle cx="72" cy="52" r="3.5" fill="H"/><path d="M32 40l-8 6" stroke="B" stroke-width="4" stroke-linecap="round"/>',
  gen: '<circle cx="48" cy="34" r="22" fill="A"/><circle cx="48" cy="34" r="14" fill="B"/><circle cx="48" cy="34" r="5" fill="H"/>'
};
function mIcon(m, dark, w) {
  var body = dark ? '#ffffff' : '#0e0e0e', hole = dark ? '#0e0e0e' : '#ffffff', g = ICON[mKind(m)].replace(/"B"/g, '"' + body + '"').replace(/"H"/g, '"' + hole + '"').replace(/"A"/g, '"#d31f16"');
  return '<svg class="micon" width="' + w + '" height="' + Math.round(w * 2 / 3) + '" viewBox="0 0 96 64" aria-hidden="true">' + g + '</svg>';
}
var ERR = {
  forbidden: 'La clave de la app no coincide con la planilla. Avisale al administrador.', not_configured: 'La app todavía no está conectada a la planilla.',
  bad_pin: 'PIN incorrecto', locked: 'Demasiados intentos. Esperá 10 minutos.', no_pin: 'Todavía no tenés PIN.', pin_exists: 'Ese operador ya tiene PIN. Pedile al supervisor que lo restablezca.',
  unknown_operator: 'Ese operador no está habilitado.', unknown_doc: 'No encontramos ese documento. Revisalo o avisale a tu supervisor.', unknown_machine: 'La máquina ya no está habilitada', bad_hours: 'Horómetros inválidos', bad_items: 'Las horas por trabajo no coinciden',
  bad_date: 'Fecha inválida', bad_fuel: 'Datos de combustible inválidos', bad_id: 'Identificador inválido', no_crypto: 'Abrí la app desde su dirección https.', own_machine: 'Esa ya es tu máquina.'
};
function errMsg(e) { if (e && e.offline) return 'Sin señal'; return ERR[e && e.error] || ('Error del servidor' + (e && e.error ? ' (' + e.error + ')' : '')); }

/* ---------- servidor ---------- */
var SEGURAS = { identify: 1, bootstrap: 1, sync: 1, supData: 1 }; // se pueden repetir sin riesgo
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
function applyBootstrap(res) {
  applyMachines(res.machines); S.shift = res.shiftHours || 9;
}
function applySync(res) {
  applyMachines(res.machines); S.myReqs = res.requests || []; S.myReqsDate = res.serverDate || today();
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
  return '<div class="topin"><img class="logo" src="icons/logo.png" alt="WheelCo">' + who + '</div>';
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
    applyMachines(res.machines); S.shift = res.shiftHours || 9;
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
  if (m) h += '<div class="mcard"><div class="mrow"><span class="eyebrow">Tu máquina</span><span class="mtype">' + esc(m.name) + '</span></div><div class="mrow"><div class="mcode">' + esc(m.code) + '</div>' + mIcon(m, true, 128) + '</div><div class="horo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff6a60" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M12 3v2"/></svg><span>Último horómetro</span><b>' + fmt(m.horo) + '</b></div></div><button class="btn primary" data-act="newForm" data-m="' + esc(m.id) + '">Cargar informe de hoy</button>';
  else h += '<div class="callout warn">No tenés una máquina asignada. Pedí autorización para la que vas a usar.</div>';
  myReqs().forEach(function (r) {
    if (r.status === 'aprobada') h += '<div class="card"><div class="eyebrow">Autorizada para hoy</div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:6px 0 12px"><b class="mono" style="font-size:1.25rem">' + esc(r.machineCode) + '</b><span class="pill ok">Aprobada</span></div><button class="btn primary" data-act="newForm" data-m="' + esc(r.machineId) + '">Cargar informe con ' + esc(r.machineCode) + '</button></div>';
    else h += '<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span>Pediste <b class="mono">' + esc(r.machineCode) + '</b></span><span class="pill ' + (r.status === 'rechazada' ? 'crit' : 'warn') + '">' + (r.status === 'rechazada' ? 'Rechazada' : 'Esperando al supervisor') + '</span></div>';
  });
  h += '<button class="btn" data-act="otra">Usé otra máquina</button>';
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
  var m = S.machines[mid];
  S.form = { machineId: mid, date: today(), hIni: String(m.horo).replace('.', ','), unlock: false, hFin: '', items: [], hrs: {}, hrsEdited: false, fuel: null, ftype: 'Gasoil', liters: '', fhoro: '', notes: '' };
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
  h += '<label class="fld">Inicial' + (F.unlock ? '' : ' <span class="muted" style="font-weight:400">(el último que se registró)</span>') + '<input class="num" id="f-hini" data-in="hIni" inputmode="decimal" autocomplete="off" value="' + esc(F.hIni) + '"' + (F.unlock ? '' : ' readonly') + '></label>';
  if (!F.unlock) h += '<button class="link" data-act="unlock" style="align-self:flex-start">El horómetro no marca ese número</button>';
  h += '<label class="fld">Final<input class="num" id="f-hfin" data-in="hFin" inputmode="decimal" autocomplete="off" placeholder="0000,0" value="' + esc(F.hFin) + '"></label>';
  h += '<div class="hbox" id="hbox"><span>Horas trabajadas</span><span class="mono" id="hval">—</span></div><div class="small" id="hmsg" style="min-height:1.2em"></div></section>';
  h += '<section class="blk"><h3><span>3</span>Trabajos realizados</h3><p class="muted small" style="margin:0">Tocá todos los que hiciste.</p><div class="tgl">' + ITEMS.map(function (i) { return '<button class="tg" data-act="item" data-k="' + i[0] + '" aria-pressed="' + (F.items.indexOf(i[0]) > -1) + '">' + esc(i[1]) + '</button>'; }).join('') + '</div><div id="hrows">' + hrowsHTML() + '</div></section>';
  h += '<section class="blk"><h3><span>4</span>Combustible</h3><p class="muted small" style="margin:0">¿Cargaste combustible?</p><div class="grid2"><button class="tg c" data-act="fuel" data-v="no" aria-pressed="' + (F.fuel === false) + '">No</button><button class="tg c" data-act="fuel" data-v="si" aria-pressed="' + (F.fuel === true) + '">Sí</button></div>';
  h += '<div id="fuelf" class="stack tight"' + (F.fuel === true ? '' : ' hidden') + '><div class="grid2"><button class="tg c" data-act="ftype" data-v="Gasoil" aria-pressed="' + (F.ftype === 'Gasoil') + '">Gasoil</button><button class="tg c" data-act="ftype" data-v="Nafta" aria-pressed="' + (F.ftype === 'Nafta') + '">Nafta</button></div><label class="fld">Litros cargados<input class="num" id="f-lit" data-in="liters" inputmode="decimal" autocomplete="off" value="' + esc(F.liters) + '"></label><label class="fld">Horómetro al cargar<input class="num" id="f-fh" data-in="fhoro" inputmode="decimal" autocomplete="off" value="' + esc(F.fhoro) + '"></label></div></section>';
  h += '<section class="blk"><h3><span>5</span>Observaciones</h3><label class="fld"><span class="muted" style="font-weight:400">Si hubo avería, parada o algo para avisar (opcional)</span><textarea class="txt" id="f-notes" data-in="notes">' + esc(F.notes) + '</textarea></label></section>';
  h += '<div id="errs"></div><button class="btn primary" id="send" data-act="send">Enviar informe</button></div>';
  return h;
}
function totalHours() { var F = S.form, a = parseNum(F.hIni), b = parseNum(F.hFin); return isFinite(a) && isFinite(b) ? r1(b - a) : NaN; }
function hrowsHTML() {
  var F = S.form, n = F.items.length; if (!n) return '';
  if (n === 1) return '<p class="muted small" style="margin:0">Todas las horas van a «' + esc(ITEM_N[F.items[0]]) + '».</p>';
  return '<div class="stack tight"><p class="muted small" style="margin:6px 0 0">Repartí las horas entre los trabajos.</p>' + F.items.map(function (k) { return '<div class="hrow"><span>' + esc(ITEM_N[k]) + '</span><input data-in="hrs" data-k="' + k + '" inputmode="decimal" autocomplete="off" value="' + esc(F.hrs[k] == null ? '' : F.hrs[k]) + '"></div>'; }).join('') + '<div class="small" id="hsum" style="font-weight:600"></div></div>';
}
function split() {
  var F = S.form, t = totalHours(), n = F.items.length; if (!(t > 0) || n < 2) return;
  var each = r1(t / n), acc = 0; F.items.forEach(function (k, i) { var v = i === n - 1 ? r1(t - acc) : each; acc += v; F.hrs[k] = String(v).replace('.', ','); });
}
function liveUpdate() {
  var F = S.form, t = totalHours(), box = document.getElementById('hbox'), val = document.getElementById('hval'), msg = document.getElementById('hmsg'); if (!box) return;
  if (isFinite(t) && t > 0 && t <= 24) { val.textContent = fmt(t) + ' h'; box.className = 'hbox'; msg.textContent = t > 14 ? 'Son muchas horas. Revisá el número final.' : ''; msg.style.color = 'var(--warn)'; }
  else if (isFinite(t)) { val.textContent = '—'; box.className = 'hbox bad'; msg.textContent = t <= 0 ? 'El horómetro final tiene que ser mayor que el inicial.' : 'Son más de 24 horas. Revisá el horómetro final.'; msg.style.color = 'var(--crit)'; }
  else { val.textContent = '—'; box.className = 'hbox'; msg.textContent = ''; }
  if (F.items.length > 1) {
    if (!F.hrsEdited) { split(); document.querySelectorAll('#hrows input[data-k]').forEach(function (i) { i.value = F.hrs[i.dataset.k] || ''; }); }
    var s = 0; F.items.forEach(function (k) { var v = parseNum(F.hrs[k]); if (isFinite(v)) s += v; }); s = r1(s);
    var el = document.getElementById('hsum'); if (el) { if (isFinite(t) && t > 0) { var ok = Math.abs(s - t) <= 0.05; el.textContent = 'Sumás ' + fmt(s) + ' de ' + fmt(t) + ' h' + (ok ? ' ✓' : ''); el.style.color = ok ? 'var(--good)' : 'var(--warn)'; } else el.textContent = ''; }
  }
}
function showErrs(list) {
  var e = document.getElementById('errs'); if (!e) return;
  e.innerHTML = list.length ? '<div class="callout" role="alert">Revisá esto antes de enviar:<ul>' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
  if (list.length && e.scrollIntoView) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function buildReport() {
  var F = S.form, m = S.machines[F.machineId], errs = [], flags = [];
  var hIni = parseNum(F.hIni), hFin = parseNum(F.hFin), hours = 0, t = today();
  if (!isFinite(hIni)) errs.push('Falta el horómetro inicial.');
  if (!isFinite(hFin)) errs.push('Falta el horómetro final.');
  if (isFinite(hIni) && isFinite(hFin)) {
    hours = r1(hFin - hIni);
    if (hours <= 0) errs.push('El horómetro final tiene que ser mayor que el inicial.');
    else if (hours > 24) errs.push('Son más de 24 horas. Revisá el horómetro final.');
    else if (hours > 14) flags.push('Más de 14 horas en un informe');
  }
  if (!F.date || F.date > t) errs.push('La fecha no puede ser de un día futuro.');
  else if (F.date !== t) flags.push('Fecha distinta de hoy');
  var items = {};
  if (!F.items.length) errs.push('Elegí al menos un trabajo realizado.');
  else if (F.items.length === 1) items[F.items[0]] = hours;
  else {
    var s = 0; F.items.forEach(function (k) { var v = parseNum(F.hrs[k]); if (!isFinite(v) || v < 0) v = 0; items[k] = v; s += v; }); s = r1(s);
    if (hours > 0 && Math.abs(s - hours) > 0.05) errs.push('Las horas de los trabajos suman ' + fmt(s) + ' y tienen que sumar ' + fmt(hours) + '.');
  }
  var fuel = null;
  if (F.fuel === null) errs.push('Contestá si cargaste combustible.');
  else if (F.fuel) {
    var L = parseNum(F.liters), fh = parseNum(F.fhoro);
    if (!(L > 0)) errs.push('Falta cuántos litros cargaste.'); else if (L > 600) flags.push('Carga de más de 600 litros');
    if (!isFinite(fh)) errs.push('Falta el horómetro al cargar combustible.');
    else if (isFinite(hIni) && isFinite(hFin) && (fh < hIni || fh > hFin)) errs.push('El horómetro de la carga tiene que estar entre ' + fmt(hIni) + ' y ' + fmt(hFin) + '.');
    if (L > 0 && isFinite(fh)) fuel = { type: F.ftype, liters: L, horo: fh };
  }
  if (F.unlock && isFinite(hIni) && Math.abs(hIni - m.horo) > 0.05) flags.push('Horómetro inicial distinto al último registrado (' + fmt(m.horo) + ')');
  return { errs: errs, report: { id: uid(), date: F.date, machineId: m.id, hIni: hIni, hFin: hFin, items: items, fuel: fuel, notes: F.notes.trim(), flags: flags, createdAt: new Date().toISOString() }, hours: hours };
}
function submitForm() {
  var b = buildReport(); if (b.errs.length) { showErrs(b.errs); return; }
  var r = b.report, m = S.machines[r.machineId];
  S.queue.push({ opId: S.session.opId, r: r });
  m.horo = Math.max(m.horo, r.hFin);
  S.last = { id: r.id, date: r.date, machineCode: m.code, hIni: r.hIni, hFin: r.hFin, hours: b.hours, items: r.items, fuel: r.fuel, flags: r.flags };
  save(); go('done'); syncNow();
}
function doneView() {
  var r = S.last; if (!r) return '';
  var ks = Object.keys(r.items), it = ks.map(function (k) { return ITEM_N[k] + (ks.length > 1 ? ' (' + fmt(r.items[k]) + ' h)' : ''); }).join(', ');
  var enCola = S.queue.some(function (q) { return q.r.id === r.id; });
  var estado = enCola ? '<div class="callout warn" style="text-align:left">Guardado en este celular. Se envía solo cuando haya señal.</div>' : '<div class="callout ok" style="text-align:left">Enviado a la planilla ✓</div>';
  return '<div class="done stack"><div class="check">✓</div><h1 class="big">Informe cargado</h1><dl class="sum"><dt>Máquina</dt><dd class="mono">' + esc(r.machineCode) + '</dd><dt>Fecha</dt><dd>' + esc(dlong(r.date)) + '</dd><dt>Horas</dt><dd class="mono">' + fmt(r.hours) + ' h (' + fmt(r.hIni) + ' → ' + fmt(r.hFin) + ')</dd><dt>Trabajos</dt><dd>' + esc(it) + '</dd><dt>Combustible</dt><dd>' + (r.fuel ? fmt(r.fuel.liters, 0) + ' L de ' + esc(r.fuel.type) : 'No cargó') + '</dd></dl>' + estado + (r.flags.length ? '<div class="callout warn" style="text-align:left">Tu supervisor va a revisar este informe: ' + esc(r.flags.join('; ')) + '.</div>' : '') + '<button class="btn primary" data-act="home">Listo</button></div>';
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
function filt() {
  var f = S.f; return S.sup.reports.filter(function (r) { return f.machine === 'all' || r.machineId === f.machine; });
}
function workdays(a, b) { var n = 0, p = a.split('-'), q = b.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]), e = new Date(+q[0], +q[1] - 1, +q[2]); for (; d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n++; return n; }
function stats() {
  var rs = filt(), f = S.f, wd = workdays(f.from, f.to), sh = S.sup.config.shiftHours || 9, fp = S.sup.config.fuelPrice || 0;
  var ms = S.sup.machines.filter(function (m) { return f.machine === 'all' || m.id === f.machine; });
  var byM = {}; S.sup.machines.forEach(function (m) { byM[m.id] = m; });
  var rows = ms.map(function (m) {
    var x = rs.filter(function (r) { return r.machineId === m.id; }), days = {}, h = 0, L = 0;
    x.forEach(function (r) { days[r.date] = 1; h += r.hours; if (r.fuel) L += r.fuel.liters; });
    var nd = Object.keys(days).length, lph = h > 0 && L > 0 ? L / h : null, prog = wd * sh;
    return { m: m, days: nd, hours: h, liters: L, lph: lph, ref: m.refLph, hpd: nd ? h / nd : 0, util: prog ? h / prog : 0, cost: h * (m.tarifa || 0) + L * fp };
  });
  var items = {}; rs.forEach(function (r) { var m = byM[r.machineId], t = m ? m.tarifa || 0 : 0; Object.keys(r.items || {}).forEach(function (k) { var o = items[k] || (items[k] = { h: 0, c: 0 }); o.h += r.items[k]; o.c += r.items[k] * t; }); });
  var H = rows.reduce(function (a, r) { return a + r.hours; }, 0), L2 = rows.reduce(function (a, r) { return a + r.liters; }, 0), C = rows.reduce(function (a, r) { return a + r.cost; }, 0);
  return { rs: rs, rows: rows, items: items, H: H, L: L2, C: C };
}
function bars(rows, fmtv, max) {
  var mx = max || Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([0.0001]));
  return rows.map(function (r) { return '<div class="brow"><span class="lb" title="' + esc(r.l) + '">' + esc(r.l) + '</span><span class="track"><span class="fill" style="width:' + Math.max(r.v / mx * 100, r.v > 0 ? 1.5 : 0) + '%"></span></span><span class="vl">' + fmtv(r.v) + '</span></div>'; }).join('') || '<p class="muted small">Sin datos en este período.</p>';
}
function supView() {
  var tabs = [['panel', 'Panel'], ['informes', 'Informes'], ['solicitudes', 'Solicitudes']];
  var rev = S.sup.reports.filter(function (r) { return r.status === 'validar'; }).length, pend = S.sup.requests.filter(function (r) { return r.status === 'pendiente'; }).length;
  var badge = { informes: rev, solicitudes: pend };
  var h = '<nav class="nav" aria-label="Secciones">' + tabs.map(function (t) { return '<button data-act="tab" data-t="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + (badge[t[0]] ? '<span class="pill warn">' + badge[t[0]] + '</span>' : '') + '</button>'; }).join('') + '<button data-act="refresh" style="margin-left:auto">Actualizar</button></nav>';
  h += '<div' + (S.supLoading ? ' class="loading"' : '') + '>';
  if (S.tab === 'panel') h += filtersHTML() + panelView();
  else if (S.tab === 'informes') h += filtersHTML() + informesView();
  else h += solicitudesView();
  return h + '</div>';
}
function filtersHTML() {
  var f = S.f;
  return '<div class="filters"><label>Desde<input type="date" id="fl-from" data-in="ffrom" value="' + f.from + '"></label><label>Hasta<input type="date" id="fl-to" data-in="fto" value="' + f.to + '"></label><label>Máquina<select id="fl-m" data-in="fm"><option value="all">Todas</option>' + S.sup.machines.map(function (m) { return '<option value="' + esc(m.id) + '"' + (f.machine === m.id ? ' selected' : '') + '>' + esc(m.code) + ' · ' + esc(m.name) + '</option>'; }).join('') + '</select></label><div style="display:flex;gap:6px"><button class="btn sm" data-act="range" data-d="7">7 días</button><button class="btn sm" data-act="range" data-d="30">30 días</button><button class="btn sm" data-act="range" data-d="0">Este mes</button></div></div>';
}
function panelView() {
  var s = stats(), h = '', cfg = S.sup.config;
  var rev = s.rs.filter(function (r) { return r.status === 'validar'; }).length;
  if (rev) h += '<div class="callout warn" style="margin-bottom:16px">Hay ' + rev + ' informe' + (rev > 1 ? 's' : '') + ' marcado' + (rev > 1 ? 's' : '') + ' para revisar en este período. <button class="link" data-act="tab" data-t="informes">Verlos</button></div>';
  var lph = s.H > 0 && s.L > 0 ? s.L / s.H : null;
  h += '<div class="kpis"><div class="kpi"><span class="eyebrow">Horas trabajadas</span><span class="v">' + fmt(s.H) + '<small>h</small></span></div><div class="kpi"><span class="eyebrow">Combustible cargado</span><span class="v">' + fmt(s.L, 0) + '<small>L</small></span></div><div class="kpi"><span class="eyebrow">Consumo medio</span><span class="v">' + (lph ? fmt(lph) : '—') + '<small>L/h</small></span></div><div class="kpi"><span class="eyebrow">Costo estimado</span><span class="v">' + gs(s.C) + '</span></div></div>';
  var byM = s.rows.slice().sort(function (a, b) { return b.hours - a.hours; }).map(function (r) { return { l: r.m.code, v: r.hours }; });
  var byI = Object.keys(s.items).map(function (k) { return { l: ITEM_N[k] || k, v: s.items[k].h }; }).sort(function (a, b) { return b.v - a.v; });
  var fuelRows = s.rows.filter(function (r) { return r.lph && r.ref; }).sort(function (a, b) { return (b.lph / b.ref) - (a.lph / a.ref); });
  var fmx = Math.max.apply(null, fuelRows.map(function (r) { return Math.max(r.lph, r.ref); }).concat([1])) * 1.1;
  var fh = fuelRows.map(function (r) {
    var d = r.lph / r.ref - 1, st = d > 0.15 ? '<span class="pill warn">▲ Alto</span>' : d < -0.25 ? '<span class="pill info">▼ Bajo</span>' : '<span class="pill ok">● Normal</span>';
    return '<div class="brow" style="grid-template-columns:minmax(4.5rem,6rem) 1fr 4.2rem 5.2rem"><span class="lb">' + esc(r.m.code) + '</span><span class="track"><span class="fill" style="width:' + r.lph / fmx * 100 + '%"></span><span class="tick" style="left:calc(' + r.ref / fmx * 100 + '% - 1px)"></span></span><span class="vl">' + fmt(r.lph) + '</span>' + st + '</div>';
  }).join('') || '<p class="muted small">Sin cargas de combustible en este período.</p>';
  var util = s.rows.slice().sort(function (a, b) { return b.util - a.util; }).map(function (r) { return { l: r.m.code, v: r.util * 100 }; });
  h += '<div class="panels"><section class="panel"><h2>Horas por máquina</h2><div class="sub">Suma de horas de los informes</div>' + bars(byM, function (v) { return fmt(v) + ' h'; }) + '</section>' +
    '<section class="panel"><h2>Horas por ítem de trabajo</h2><div class="sub">Todas las máquinas del filtro</div>' + bars(byI, function (v) { return fmt(v) + ' h'; }) + '</section>' +
    '<section class="panel"><h2>Rendimiento de combustible</h2><div class="sub">Litros cargados ÷ horas trabajadas</div><div class="legend"><span><i class="fill" style="position:static;display:inline-block;width:18px;height:8px;border-radius:2px"></i>Consumo real (L/h)</span><span><i class="tick" style="position:static;display:inline-block;height:12px"></i>Referencia</span></div>' + fh + '</section>' +
    '<section class="panel"><h2>Utilización de las máquinas</h2><div class="sub">Horas trabajadas ÷ horas programadas (' + fmt(cfg.shiftHours || 9, 0) + ' h por día, lunes a sábado)</div>' + bars(util, function (v) { return fmt(v, 0) + ' %'; }, 100) + '</section></div>';
  h += '<div class="sec"><h2>Resumen por máquina</h2></div><div class="tblw"><table><thead><tr><th>Máquina</th><th class="n">Días</th><th class="n">Horas</th><th class="n">Hs/día</th><th class="n">Utiliz.</th><th class="n">Litros</th><th class="n">L/h</th><th class="n">Ref. L/h</th><th class="n">Costo</th></tr></thead><tbody>' + s.rows.map(function (r) { return '<tr><td><b>' + esc(r.m.code) + '</b><div class="muted small">' + esc(r.m.name) + '</div></td><td class="n">' + r.days + '</td><td class="n">' + fmt(r.hours) + '</td><td class="n">' + fmt(r.hpd) + '</td><td class="n">' + fmt(r.util * 100, 0) + ' %</td><td class="n">' + fmt(r.liters, 0) + '</td><td class="n">' + (r.lph ? fmt(r.lph) : '—') + '</td><td class="n">' + fmt(r.ref || 0, 0) + '</td><td class="n">' + gs(r.cost) + '</td></tr>'; }).join('') + '<tr><td><b>Total</b></td><td class="n"></td><td class="n"><b>' + fmt(s.H) + '</b></td><td class="n"></td><td class="n"></td><td class="n"><b>' + fmt(s.L, 0) + '</b></td><td class="n"></td><td class="n"></td><td class="n"><b>' + gs(s.C) + '</b></td></tr></tbody></table></div>';
  h += '<p class="muted small" style="margin-top:10px">Costo = horas × tarifa horaria de la máquina + litros × precio del combustible. Para cambiar tarifas, consumos de referencia, máquinas u operadores, editá las hojas de la planilla de Google y tocá «Actualizar».</p>';
  var ih = Object.keys(s.items).sort(function (a, b) { return s.items[b].h - s.items[a].h; }).map(function (k) { var o = s.items[k]; return '<tr><td>' + esc(ITEM_N[k] || k) + '</td><td class="n">' + fmt(o.h) + '</td><td class="n">' + (s.H ? fmt(o.h / s.H * 100, 0) : 0) + ' %</td><td class="n">' + gs(o.c) + '</td></tr>'; }).join('');
  h += '<div class="sec"><h2>Detalle por ítem</h2></div><div class="tblw"><table><thead><tr><th>Ítem</th><th class="n">Horas</th><th class="n">% del total</th><th class="n">Costo de máquina</th></tr></thead><tbody>' + (ih || '<tr><td colspan="4" class="muted">Sin datos en este período.</td></tr>') + '</tbody></table></div>';
  return h;
}
function stPill(r) { return r.status === 'validar' ? '<span class="pill warn">A revisar</span>' : '<span class="pill ok">Válido</span>'; }
function informesView() {
  var rs = filt().slice().sort(function (a, b) { return b.date.localeCompare(a.date); }), lim = rs.slice(0, 150);
  var h = '<div class="sec" style="margin-top:0"><h2>Informes (' + rs.length + ')</h2><button class="btn sm" data-act="csv">Descargar CSV</button></div><div class="tblw"><table><thead><tr><th>Fecha</th><th>Máquina</th><th>Operador</th><th class="n">Horómetro</th><th class="n">Horas</th><th>Trabajos</th><th class="n">Combustible</th><th>Estado</th></tr></thead><tbody>';
  h += lim.map(function (r) {
    var ks = Object.keys(r.items || {}), chips = ks.map(function (k) { return '<span class="pill">' + esc(ITEM_N[k] || k) + (ks.length > 1 ? ' · ' + fmt(r.items[k]) : '') + '</span>'; }).join('');
    var ex = r.status === 'validar' ? '<div class="small" style="color:var(--warn);margin-top:4px">' + esc((r.flags || []).join('; ')) + '</div>' + (r.notes ? '<div class="small muted">' + esc(r.notes) + '</div>' : '') + '<button class="btn sm" style="margin-top:6px" data-act="valid" data-id="' + esc(r.id) + '">Dar por válido</button>' : (r.notes ? '<div class="small muted" style="margin-top:4px">' + esc(r.notes) + '</div>' : '');
    return '<tr><td style="white-space:nowrap">' + esc(dmy(r.date)) + '</td><td><b>' + esc(r.machineCode) + '</b></td><td>' + esc(r.operatorName) + '</td><td class="n">' + fmt(r.hIni) + ' → ' + fmt(r.hFin) + '</td><td class="n">' + fmt(r.hours) + '</td><td><div class="chips">' + chips + '</div></td><td class="n">' + (r.fuel ? fmt(r.fuel.liters, 0) + ' L' : '—') + '</td><td>' + stPill(r) + ex + '</td></tr>';
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
function csvExport() {
  var q = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var rows = [['Fecha', 'Máquina', 'Operador', 'Horómetro inicial', 'Horómetro final', 'Horas', 'Trabajos', 'Combustible', 'Litros', 'Horómetro de carga', 'Estado', 'Observaciones']];
  filt().slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (r) { rows.push([r.date, r.machineCode, r.operatorName, String(r.hIni).replace('.', ','), String(r.hFin).replace('.', ','), String(r.hours).replace('.', ','), Object.keys(r.items || {}).map(function (k) { return (ITEM_N[k] || k) + ': ' + r.items[k]; }).join(' | '), r.fuel ? r.fuel.type : '', r.fuel ? String(r.fuel.liters).replace('.', ',') : '', r.fuel ? String(r.fuel.horo).replace('.', ',') : '', r.status === 'validar' ? 'A revisar' : 'Válido', r.notes || '']); });
  var blob = new Blob(['﻿' + rows.map(function (r) { return r.map(q).join(';'); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'informes-maquinaria-' + S.f.from + '_' + S.f.to + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------- acciones ---------- */
var act = {
  role: function (d) { S.login = newLogin(d.r); render(); },
  key: function (d) { keyPress(d.k); },
  docGo: docDone,
  back: function () { var L = S.login; if (L.busy) return; S.login = newLogin('op'); S.pendingSession = null; render(); },
  logout: function () { S.session = null; S.pendingSession = null; S.sup = null; S.f = null; save(); S.login = newLogin('op'); go('login'); refreshBootstrap(); },
  home: function () { go('opHome'); },
  syncnow: function () { toast('Enviando…'); syncNow(); },
  discard: function (d) { S.failed = S.failed.filter(function (f) { return f.r.id !== d.id; }); save(); render(); },
  otra: function () { S.reqPick = null; S.reqNote = ''; go('otra'); },
  reqPick: function (d) { S.reqPick = d.m; render(); },
  reqSend: reqSend,
  newForm: function (d) { newForm(d.m); },
  fmach: function (d) { var m = S.machines[d.m]; S.form.machineId = d.m; S.form.hIni = String(m.horo).replace('.', ','); S.form.unlock = false; render(); },
  unlock: function () { S.form.unlock = true; render(); var i = document.getElementById('f-hini'); if (i) i.focus(); },
  item: function (d, b) {
    var F = S.form, i = F.items.indexOf(d.k); if (i > -1) { F.items.splice(i, 1); delete F.hrs[d.k]; } else F.items.push(d.k);
    F.hrsEdited = false; b.setAttribute('aria-pressed', String(F.items.indexOf(d.k) > -1));
    split(); document.getElementById('hrows').innerHTML = hrowsHTML(); liveUpdate();
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
  valid: function (d) { api('supValidate', { pin: S.session.pinH, id: d.id }).then(function () { S.sup.reports.forEach(function (r) { if (r.id === d.id) r.status = 'ok'; }); render(); }).catch(supFail); },
  decide: function (d) { api('supRequest', { pin: S.session.pinH, id: d.id, status: d.v }).then(function () { S.sup.requests.forEach(function (r) { if (r.id === d.id) r.status = d.v; }); render(); }).catch(supFail); }
};
var inp = {
  date: function (v) { S.form.date = v; },
  hIni: function (v) { S.form.hIni = v; liveUpdate(); },
  hFin: function (v) { S.form.hFin = v; liveUpdate(); },
  hrs: function (v, el) { S.form.hrs[el.dataset.k] = v; S.form.hrsEdited = true; liveUpdate(); },
  liters: function (v) { S.form.liters = v; }, fhoro: function (v) { S.form.fhoro = v; }, notes: function (v) { S.form.notes = v; },
  reqNote: function (v) { S.reqNote = v; }
};
var onchange = {
  ffrom: function (v) { if (v) { S.f.from = v; loadSup(); } }, fto: function (v) { if (v) { S.f.to = v; loadSup(); } }, fm: function (v) { S.f.machine = v; render(); }
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
if (CFG.API_URL && CFG.API_KEY) { refreshBootstrap().then(function () { if (S.session && S.session.role === 'op') syncNow(); }); }
if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); }); }
if (window.__IED_TEST__) window.__IED_TEST__.hooks = { S: S, act: act, inp: inp, api: api, syncNow: syncNow, buildReport: buildReport, submitForm: submitForm, pinDone: pinDone, docDone: docDone, refreshBootstrap: refreshBootstrap, parseNum: parseNum, render: render, setCFG: function (c) { Object.assign(CFG, c); } };
})();
