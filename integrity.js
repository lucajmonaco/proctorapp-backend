// Integrity helpers: client IP/UA, VPN/proxy blocking (proxycheck.io),
// transactional email (Resend), and anti-cheat flags for async interviews.
// All external calls are gated behind env keys and fail OPEN (never block a
// candidate or crash a request if a provider key is missing or the API errors).
module.exports = function (db) {
  function ip(req) {
    try {
      var xf = String((req.headers['x-forwarded-for'] || '')).split(',')[0].trim();
      return xf || (req.socket && req.socket.remoteAddress) || '';
    } catch (e) { return ''; }
  }
  function ua(req) {
    try { return String(req.headers['user-agent'] || '').slice(0, 300); } catch (e) { return ''; }
  }

  // Returns true only when confident the IP is a VPN/proxy. No key -> false (off).
  async function isVpnIp(ipAddr) {
    var key = process.env.PROXYCHECK_API_KEY;
    if (!key || !ipAddr) return false;
    var clean = String(ipAddr).replace(/[^0-9a-fA-F:.]/g, '');
    if (!clean || clean === '127.0.0.1' || clean === '::1') return false;
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 4000);
      var r = await fetch('https://proxycheck.io/v2/' + clean + '?key=' + key + '&vpn=1&risk=1', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) return false;
      var data = await r.json();
      var rec = data && data[clean];
      return !!(rec && (rec.proxy === 'yes' || rec.type === 'VPN'));
    } catch (e) { return false; }
  }

  // If the request IP is a VPN/proxy, respond 403 and return true (caller should return).
  async function blockIfVpn(req, res) {
    try {
      if (await isVpnIp(ip(req))) {
        res.status(403).json({ error: 'Please turn off your VPN or proxy to continue. This interview must be taken on your own personal connection and device.', code: 'vpn' });
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function sendMail(to, subject, html) {
    var key = process.env.RESEND_API_KEY;
    if (!key || !to) return false;
    var from = process.env.MAIL_FROM || 'InterviewMyCandidate <notifications@interviewmycandidate.com>';
    try {
      var r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from, to: [to], subject: subject, html: html })
      });
      return r.ok;
    } catch (e) { return false; }
  }

  function computeAsyncFlags(iv) {
    var flags = [];
    try {
      if (iv.device_ip && iv.finish_ip && iv.device_ip !== iv.finish_ip) flags.push('IP changed during the interview');
      if (iv.device_ip) {
        var dup = db.prepare("SELECT COUNT(*) c FROM async_interviews WHERE org_id=? AND device_ip=? AND id<>?").get(iv.org_id, iv.device_ip, iv.id);
        if (dup && dup.c > 0) flags.push('Same IP as ' + dup.c + ' other candidate(s) in your org');
      }
    } catch (e) {}
    return { count: flags.length, list: flags };
  }

  function notifyRecruiterAsyncComplete(iv, recId) {
    try {
      var u = db.prepare('SELECT name, email FROM users WHERE id=?').get(iv.created_by);
      if (!u || !u.email) return;
      var firstName = (u.name || '').split(' ')[0] || 'there';
      var cand = iv.candidate_name || 'A candidate';
      var role = iv.role_title || 'the role';
      var base = process.env.PUBLIC_BASE_URL || 'https://interviewmycandidate.com';
      var link = base + '/recording/' + recId;
      var subject = cand + ' finished their interview - it is waiting in your library';
      var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto">'
        + '<div style="background:#0f2241;border-radius:14px 14px 0 0;padding:22px 26px;text-align:center"><span style="color:#fff;font-weight:800;font-size:16px;letter-spacing:-.3px">Interview<span style="color:#60a5fa">My</span>Candidate</span></div>'
        + '<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:28px 26px;background:#fff">'
        + '<h2 style="color:#0f2241;margin:0 0 12px;font-size:20px">Good news, ' + firstName + '</h2>'
        + '<p style="font-size:15px;line-height:1.65;color:#334155;margin:0 0 14px"><strong>' + cand + '</strong> just completed their async interview for <strong>' + role + '</strong>.</p>'
        + '<p style="font-size:15px;line-height:1.65;color:#334155;margin:0 0 22px">It is ready and waiting for you in your library - grab a coffee and take a look whenever you are ready.</p>'
        + '<p style="margin:0"><a href="' + link + '" style="background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:10px;display:inline-block">Watch the interview</a></p>'
        + '</div>'
        + '<p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">You are receiving this because you sent this interview on InterviewMyCandidate.</p>'
        + '</div>';
      sendMail(u.email, subject, html);
    } catch (e) {}
  }

  function notifyRetentionWarning(admin, list, days) {
    try {
      if (!admin || !admin.email || !list || !list.length) return;
      var firstName = (admin.name || '').split(' ')[0] || 'there';
      var base = process.env.PUBLIC_BASE_URL || 'https://interviewmycandidate.com';
      var n = list.length;
      var rows = list.map(function (it) {
        var when = '';
        try { when = new Date(it.deleteAt).toISOString().slice(0, 10); } catch (e) {}
        var label = (it.candidate || 'Candidate') + (it.title ? (' - ' + it.title) : '');
        return '<tr><td style="padding:7px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:#334155">' + label + '</td><td style="padding:7px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:#94a3b8;white-space:nowrap">deletes ' + when + '</td></tr>';
      }).join('');
      var subject = n + ' interview recording' + (n === 1 ? '' : 's') + ' will be deleted in ' + days + ' days';
      var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto">'
        + '<div style="background:#0f2241;border-radius:14px 14px 0 0;padding:22px 26px;text-align:center"><span style="color:#fff;font-weight:800;font-size:16px;letter-spacing:-.3px">Interview<span style="color:#60a5fa">My</span>Candidate</span></div>'
        + '<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:28px 26px;background:#fff">'
        + '<h2 style="color:#0f2241;margin:0 0 12px;font-size:20px">Heads up, ' + firstName + '</h2>'
        + '<p style="font-size:15px;line-height:1.65;color:#334155;margin:0 0 14px">' + n + ' recording' + (n === 1 ? '' : 's') + ' in your library ' + (n === 1 ? 'is' : 'are') + ' scheduled to be automatically deleted in <strong>' + days + ' days</strong>, in line with the 90-day retention policy. If you still need ' + (n === 1 ? 'it' : 'any of them') + ', please download or review ' + (n === 1 ? 'it' : 'them') + ' before then.</p>'
        + '<table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;border-radius:8px;overflow:hidden;margin:0 0 20px">' + rows + '</table>'
        + '<p style="margin:0"><a href="' + base + '/recordings" style="background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:10px;display:inline-block">Open your library</a></p>'
        + '</div>'
        + '<p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">You are receiving this as the account admin for your InterviewMyCandidate organisation.</p>'
        + '</div>';
      sendMail(admin.email, subject, html);
    } catch (e) {}
  }

  return {
    ip: ip,
    ua: ua,
    isVpnIp: isVpnIp,
    blockIfVpn: blockIfVpn,
    sendMail: sendMail,
    computeAsyncFlags: computeAsyncFlags,
    notifyRecruiterAsyncComplete: notifyRecruiterAsyncComplete,
    notifyRetentionWarning: notifyRetentionWarning
  };
};
