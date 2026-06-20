// utils.js
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  return res.json();
}
const get = url => apiFetch(url, { method: 'GET' });
const post = (url, body) => apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (url, body) => apiFetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const del = url => apiFetch(url, { method: 'DELETE' });
const $ = id => document.getElementById(id);

function toast(msg, type) {
  let c = $('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast-' + type : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function requireLogin(back) {
  const me = await get('/api/auth/me');
  if (!me || !me.loggedIn) { window.location.href = back || '/'; return null; }
  return me;
}

function trustClass(score) {
  return score >= 80 ? 'trust-hi' : score >= 60 ? 'trust-mid' : 'trust-lo';
}

function showModal(id) { const el = $(id); if (el) el.style.display = 'flex'; }
function hideModal(id) { const el = $(id); if (el) el.style.display = 'none'; }
