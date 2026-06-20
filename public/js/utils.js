// Secure Interview shared utilities

function toast(msg, type) {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast-' + type : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// api(url) or api(method, url, body)
async function api(methodOrUrl, url, body) {
  let method, finalUrl, finalBody;
  if (url === undefined || url.startsWith === undefined) {
    // Called as api(url) - default GET
    method = 'GET'; finalUrl = methodOrUrl; finalBody = undefined;
  } else {
    method = methodOrUrl; finalUrl = url; finalBody = body;
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (finalBody) opts.body = JSON.stringify(finalBody);
  const res = await fetch(finalUrl, opts);
  return res.json();
}

const get = url => api('GET', url);
const post = (url, body) => api('POST', url, body);
const patch = (url, body) => api('PATCH', url, body);
const del = url => api('DELETE', url);

function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function requireLogin(redirectTo) {
  const me = await get('/api/auth/me');
  if (!me || !me.loggedIn) { window.location.href = redirectTo || '/'; return null; }
  return me;
}

function trustClass(score) {
  return score >= 80 ? 'trust-hi' : score >= 60 ? 'trust-mid' : 'trust-lo';
}

function openModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }

const $ = id => document.getElementById(id);
