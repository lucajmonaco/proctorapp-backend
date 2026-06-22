# SECURE INTERVIEW — DEVELOPMENT GUIDELINES
## MANDATORY: Run before EVERY deploy

```
GITHUB_TOKEN=your_token node scripts/preflight.js
```

**If preflight fails, fix first. Never deploy broken code.**

---

## THE 8 GOLDEN RULES

1. **No single quotes inside single-quoted JS strings in innerHTML**
   - BAD:  `c.innerHTML = '<button onclick="showModal(\'ov-id\')">';`
   - GOOD: `c.innerHTML = '<button onclick="showModal(&quot;ov-id&quot;)">';`
   - OR:   Use data-* attributes + event delegation, no inline onclick

2. **No ES6 shorthand object literals in post() calls**
   - BAD:  `post('/api/x', { title, description });`
   - GOOD: `post('/api/x', { title: title, description: description });`

3. **No optional chaining (?.) - use fallback instead**
   - BAD:  `arr.find(p => p.id===id)?.title`
   - GOOD: `(arr.find(p => p.id===id)||{}).title`

4. **Always use get()/post()/patch() from utils.js - never api(url)**

5. **Trust score null check: always !== null, never || 100**
   - 0 || 100 evaluates to 100 so zero scores show as 100

6. **Strings with HTML must never nest same-type quotes unescaped**

7. **Every new server.js API endpoint must appear in preflight required list**

8. **After every deploy: check browser console before closing**

---

## QUOTE ESCAPING QUICK REFERENCE

Context: onclick in HTML template -> onclick="fn('value')" is fine
Context: onclick inside JS string concat -> onclick="fn(&quot;value&quot;)"
Context: onclick in template literal -> onclick="fn('${val}')" is fine

---

## DEPLOY PROCEDURE (never skip steps)

1. Run: GITHUB_TOKEN=your_token node scripts/preflight.js - must exit 0
2. Update Dockerfile CACHE_BUST timestamp
3. Deploy on fly.io
4. After deploy: open site, check browser console for errors
5. Test the specific feature changed

---

## KNOWN GOTCHAS (bugs hit before - never reintroduce)

- HTML entities in JS strings -> symbols on page -> use plain text in JS
- score||100 falsy check -> 0% shows as 100% -> use score!==null?score:100
- SyntaxError in dashboard.js -> sessions list blank -> quote escaping in onclick
- SyntaxError in recordings.js -> loading forever -> showModal(&quot;ov-...&quot;)
- visibility:hidden still shows video -> use srcObject=null + AudioContext for audio
- canvas.captureStream() is video only -> compressed recordings silent -> use createMediaElementSource()
- BroadcastChannel = same-origin only -> other tabs not blocked -> use 30s countdown timer
- Encoded dashes in string anchor -> job positions route 404 -> anchor on route string directly

---

## FILE MAP

- server.js: Express backend, all API routes, Socket.io
- public/pages/index.html: Home page, candidate join section
- public/pages/dashboard.html: Interviewer dashboard, session list
- public/pages/session.html: Live interview page (interviewer side)
- public/pages/candidate.html: Live interview page (candidate side)
- public/pages/recordings.html: Recordings library, job opening folders
- public/css/main.css: Global design system
- public/js/utils.js: get(), post(), patch(), helpers
- scripts/preflight.js: Pre-deploy safety checks (RUN EVERY TIME)
- scripts/rollback.js: Rollback to stable snapshot
- scripts/snapshots/v24.json: Stable baseline SHAs

---

## PREFLIGHT CHECKS

scripts/preflight.js validates:
1. Syntax - quote escaping, ES6 shorthand, optional chaining, api() usage
2. API Consistency - every /api/ call in frontend has a matching server route
3. Required Elements - key functions/variables exist in each file
4. Forbidden Patterns - unsafe patterns flagged

Run it. Fix failures. Then deploy.


---

## PRE-LAUNCH FULL-FLOW CHECK (MANDATORY - added after the v70-v72 incident)

Preflight (syntax/API/elements) is NOT enough. Before ANY deploy, manually verify every core user flow end-to-end. A change in one area can break shared infrastructure (auth/session/DB) that preflight cannot catch. Do NOT deploy if any item fails.

ACCOUNT / AUTH
- [ ] Sign up a NEW account -> lands on dashboard AND stays signed in after a refresh
- [ ] Sign in with an existing account -> dashboard loads
- [ ] Both sign-in paths work: with company code, and by email
- [ ] After signup/login an authed API call (/api/recordings, /api/company) returns 200, not 401

DASHBOARD
- [ ] Company / Team tab loads (no "Could not load")
- [ ] "New Session" opens the session creator (does not bounce to home)
- [ ] Sessions list loads; ended -> recordings library, active -> live session
- [ ] Recordings library loads; flag-breakdown dropdown opens

INTERVIEW (needs 2 people)
- [ ] Candidate joins; interviewer sees them connect
- [ ] Consent: interviewer "Request to Record" -> candidate consent modal -> recording starts only on consent -> REC banner
- [ ] Candidate "Leave Interview" works; interviewer sees "Disconnected"

POST-DEPLOY
- [ ] Open the live site, check browser console for errors on each page
- [ ] Confirm you are still logged in after the deploy

If a 2-person flow cannot be tested solo, do NOT claim it is verified - flag it as needing a live 2-person test.

---

## CRITICAL INFRASTRUCTURE NOTES (read before deploying)

1. DATABASE IS EPHEMERAL (HIGH RISK)
   - server.js opens SQLite at path.join(__dirname, "proctor.db") = /app/proctor.db, inside the container image.
   - fly.toml has NO [mounts], so the "data" volume is NOT used.
   - => Every deploy rebuilds the image and RESETS the database (accounts, sessions, recordings). Files in /app/recordings are also lost on deploy.
   - FIX: add [mounts] source="data" destination="/data" to fly.toml; change DB path to /data/proctor.db and recordings dir to /data/recordings; run exactly ONE machine (a single Fly volume attaches to one machine only).

2. MULTIPLE MACHINES + NON-SHARED STATE
   - The app runs 2 machines, each with its own ephemeral DB and its own in-memory sessions. Requests round-robin, so a login on machine A is unknown to machine B -> intermittent "not signed in", "Could not load", "new session bounces home".
   - SQLite + in-memory sessions ONLY work on a single instance. Keep machines = 1 unless moving to a shared DB (e.g. Postgres) for both data and sessions.

3. SESSIONS USE THE DEFAULT MemoryStore
   - Logs: "connect.session() MemoryStore is not designed for a production environment". Sessions are lost on every restart/deploy and are not shared across machines.
   - With 1 machine + the volume mounted, a persistent store writing to /data keeps users logged in across deploys.

4. AUTO-DEPLOY ON PUSH is currently OFF (Fly Settings). Pushing to GitHub does NOT deploy; deploys are manual via Fly -> Deploy app -> Start Deploy. Treat every deploy as data-affecting until item #1 is fixed.
