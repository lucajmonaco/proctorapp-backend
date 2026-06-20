# Secure Interview — Build Guidelines & Safety Protocols

> **These rules apply to every code change, no exceptions.**
> Before ANY push: run `node scripts/preflight.js`
> Before ANY deploy: verify preflight passes with 0 failures

---

## 1. GOLDEN RULES

| # | Rule |
|---|------|
| G1 | **Never break working features.** If sign-in works, it must still work after your change. |
| G2 | **One concern per commit.** Fix compression → one commit. Fix flags → separate commit. |
| G3 | **Always snapshot SHAs before editing.** If something breaks, you can rollback instantly. |
| G4 | **Test the live site after every deploy.** Don't assume it worked — verify it. |
| G5 | **No template literals with embedded quotes in HTML files.** Use DOM API or var concatenation. |
| G6 | **No `api(url)` calls.** Always use `get(url)`, `post(url,body)`, or `patch(url,body)`. |
| G7 | **showModal() sets inline styles** — never rely on CSS classes for visibility. |
| G8 | **GitHub API calls only work from httpbin.org tab** — not from GitHub or Fly.io pages. |

---

## 2. PRE-PUSH CHECKLIST

Run through this before every GitHub push:

### HTML Files
- [ ] No SyntaxErrors — paste JS section into browser console to validate
- [ ] No `${}` template literals inside HTML `onclick` attributes
- [ ] No escaped quotes like `\'` in innerHTML strings
- [ ] Every modal has a close button and backdrop-click-to-close
- [ ] All buttons are wired via `document.getElementById().onclick` not inline `onclick=` with complex JS
- [ ] All `$('id')` calls reference IDs that actually exist in the HTML

### JavaScript
- [ ] No calls to `api(url)` — only `get()`, `post()`, `patch()`, `del()`
- [ ] `requireLogin()` called on every authenticated page
- [ ] `socket.emit()` only called after socket is initialized
- [ ] WebRTC `pc.getSenders()` used for track replacement (not recreating peer connection)
- [ ] All event listeners use named functions or have cooldowns where needed

### Server.js
- [ ] All new routes added before the page routes section
- [ ] All DB migrations wrapped in try/catch (ALTER TABLE)
- [ ] New tables created with IF NOT EXISTS
- [ ] requireAuth middleware on all protected endpoints
- [ ] File paths use `path.join(__dirname, ...)` not hardcoded strings

### CSS
- [ ] No class-based show/hide for modals — use inline `style.display`
- [ ] New classes don't conflict with existing ones (check for duplicates)

---

## 3. WHAT EACH FILE DOES (never accidentally overwrite)

| File | Purpose | Key dependencies |
|------|---------|-----------------|
| `server.js` | Express + Socket.io + SQLite API | multer, bcryptjs, better-sqlite3 |
| `public/js/utils.js` | Shared helpers: get/post/patch, showModal, toast, requireLogin | Used by ALL pages |
| `public/css/main.css` | All styles | Imported by ALL pages |
| `public/pages/index.html` | Landing + auth (3 modals) | utils.js |
| `public/pages/dashboard.html` | Session list + team mgmt | utils.js |
| `public/pages/session.html` | Interviewer view: video, sidebar, recording, screen share | utils.js, socket.io |
| `public/pages/candidate.html` | Candidate view: two-way video, protection, pause overlay | utils.js, socket.io |
| `public/pages/recordings.html` | Recording library, compression, share links | utils.js |
| `public/pages/share.html` | Public recording player (no auth) | none |

---

## 4. KNOWN GOTCHAS (things that have broken before)

### Docker Cache
- `COPY . .` caches old static files → **always use separate `COPY public ./public` with a CACHE_BUST comment**
- Changing `CACHE_BUST=<timestamp>` forces Docker to re-copy static files

### JavaScript Template Literals in HTML
```js
// ❌ BREAKS — quote escaping causes SyntaxError
el.innerHTML = sessions.map(s =>
  '<div onclick="go(\''+s.id+'\')">'+s.title+'</div>'
).join('');

// ✅ WORKS — use createElement
sessions.forEach(s => {
  var div = document.createElement('div');
  div.textContent = s.title;
  div.onclick = function(){ go(s.id); };
  el.appendChild(div);
});
```

### Modal Visibility
```js
// ❌ BREAKS — CSS .hidden class may be overridden
modal.classList.remove('hidden');

// ✅ WORKS — inline style always wins
showModal('ov-signin'); // sets position:fixed, display:flex inline
```

### GitHub API from Browser
```
❌ GitHub.com tab    → extension intercepts, 45s timeout
❌ Fly.io tab        → CORS blocks GitHub API  
✅ httpbin.org/get   → clean, no interference
```

### WebM Compression
```js
// ❌ BREAKS — MediaRecorder WebM has duration=Infinity
video.currentTime = seekTime; // doesn't work

// ✅ WORKS — play at 16x speed + canvas capture
video.playbackRate = 16;
video.play(); // draw frames in requestAnimationFrame loop
```

### Screen Sharing
```js
// ❌ BREAKS — only changes local display
video.srcObject = screenStream;

// ✅ WORKS — replaces track in peer connection
var sender = pc.getSenders().find(s => s.track?.kind === 'video');
sender.replaceTrack(screenStream.getVideoTracks()[0]);
```

---

## 5. FEATURE STATUS (last verified: v24)

| Feature | Status | Notes |
|---------|--------|-------|
| Sign in / Company code | ✅ Working | 3 flows: create org, join, sign in |
| Dashboard + New Session | ✅ Working | Stats row, session list, modals |
| WebRTC video + audio | ✅ Working | Two-way in both session and candidate pages |
| Flagging system | ✅ Working | No spam: once-only, cooldowns per flag type |
| Session pause overlay | ✅ Working | Fires on window blur/tab switch |
| Multiple display detection | ✅ Working | Fires ONCE per session only |
| Questions + Next/Prev | ✅ Working | Synced to candidate via socket |
| Goodbye screen | ✅ Working | session-ended socket → candidate sees thank you |
| Recording (local download) | ✅ Working | Canvas capture + audio, auto-uploads |
| Recordings library | ✅ Working | Per-user, stream, delete |
| Compression | ✅ Working | 16x playback approach, works with Infinity duration |
| Share link | ✅ Working | /share/:token → public player |
| Screen sharing | ✅ Working | replaceTrack() sends to candidate |
| Team management | ✅ Working | Create, join, invite codes |
| Multi-session concurrency | ✅ Working | Socket.io rooms, unlimited simultaneous |

---

## 6. ROLLBACK PROCEDURE

If something breaks after a deploy:

```
1. Open httpbin.org/get in Chrome (where GitHub API works)
2. Run: node scripts/rollback.js <version>
3. Go to Fly.io → Deploy app → Start Deploy
```

SHA snapshots are stored in `scripts/snapshots/` — one file per stable version.

---

## 7. DEPLOY PROCEDURE (every time)

```
Step 1: Make changes
Step 2: Run node scripts/preflight.js — must show 0 FAILURES
Step 3: Push to GitHub from httpbin.org tab
Step 4: Go to fly.io/apps/luca-proctor-fly-v1 → Deploy app → Start Deploy
Step 5: Wait for "Complete" (60-90s)
Step 6: Hard refresh (Ctrl+Shift+R) and test the specific feature you changed
Step 7: Test that previously working features still work
```

---

## 8. ENVIRONMENT

- **App URL:** https://luca-proctor-fly-v1.fly.dev
- **GitHub:** lucajmonaco/proctorapp-backend (branch: main)
- **Fly.io app:** luca-proctor-fly-v1, org: lucajmonaco-gmail-com, region: IAD
- **DB:** SQLite at /app/proctor.db (persists across deploys via Fly volume)
- **Recordings:** /app/recordings/ (persists via Fly volume)
- **Node:** 22.21.1-slim
