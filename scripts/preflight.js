#!/usr/bin/env node
// ============================================================
// PREFLIGHT CHECKER - runs before every deploy
// Usage: GITHUB_TOKEN=xxx node scripts/preflight.js
// Exits 1 if any check fails — do NOT deploy if this fails
// ============================================================

const https = require('https');

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'lucajmonaco/proctorapp-backend';
const BASE_API = 'api.github.com';

if (!TOKEN) { console.error('ERROR: Set GITHUB_TOKEN env var'); process.exit(1); }

let passed = 0, failed = 0, warnings = 0;
const errors = [];

function ok(msg){ passed++; console.log('  PASS: ' + msg); }
function fail(msg){ failed++; errors.push(msg); console.error('  FAIL: ' + msg); }
function warn(msg){ warnings++; console.warn('  WARN: ' + msg); }

async function getFile(path){
  return new Promise((resolve,reject)=>{
    const opts={hostname:BASE_API,path:'/repos/'+REPO+'/contents/'+path,headers:{'Authorization':'token '+TOKEN,'User-Agent':'preflight'}};
    https.get(opts,(res)=>{
      let data='';
      res.on('data',d=>data+=d);
      res.on('end',()=>{
        try{ const j=JSON.parse(data); resolve(j.content?Buffer.from(j.content.replace(/\n/g,''),'base64').toString('utf8'):null); }
        catch(e){ reject(e); }
      });
    }).on('error',reject);
  });
}

async function checkHTML(filename, src){
  console.log('\nChecking ' + filename + '...');

  // 1. Extract all <script> blocks
  const scriptBlocks = [];
  const re = /<script[^>]*>([sS]*?)<\/script>/gi;
  let m;
  while((m=re.exec(src))!==null){ scriptBlocks.push(m[1]); }
  const jsContent = scriptBlocks.join('\n');

  // 2. QUOTE CONFLICT: showModal('ov-...) inside single-quoted JS strings
  const badModal = /showModal\('ov-[^']+?'\)/g;
  let bm;
  while((bm=badModal.exec(jsContent))!==null){
    fail(filename+': showModal with inner single-quotes in JS string: '+bm[0].slice(0,60)+
      ' → use showModal(&quot;...&quot;) instead');
  }
  if(!(badModal.source && jsContent.match(badModal))) ok(filename+': No showModal quote conflicts');

  // 3. INLINE ONCLICK QUOTE CONFLICT: onclick="fn('"+var+"')" in innerHTML strings
  const badOnclick = /innerHTMLs*[+=][^;]*onclick="[^"]*('[^"]*'[^"]*)"[^;]*/g;
  let bo;
  while((bo=badOnclick.exec(jsContent))!==null){
    fail(filename+': Inline onclick with inner single-quotes in innerHTML: '+bo[0].slice(0,80));
  }

  // 4. ES6 SHORTHAND in post() calls: post('/api/x', {title, description}) 
  const badShorthand = /post\([^)]+,\s*\{\s*[a-zA-Z]+\s*,\s*[a-zA-Z]+\s*\}\s*\)/g;
  let bs;
  while((bs=badShorthand.exec(jsContent))!==null){
    fail(filename+': ES6 shorthand object in post() call (breaks older parsers): '+bs[0].slice(0,60));
  }

  // 5. OPTIONAL CHAINING ?.  in innerHTML - can fail in some browsers
  const optChain = /innerHTML[^;]*\?\.[a-zA-Z]/g;
  let oc;
  while((oc=optChain.exec(jsContent))!==null){
    warn(filename+': Optional chaining in innerHTML string may fail: '+oc[0].slice(0,60));
  }

  // 6. HTML entities in JS strings (&#xxx; that render as literals)
  const badEntities = /['"](.*?)&#[0-9]+;(.*?)['"]/g;
  let be;
  let entityCount = 0;
  while((be=badEntities.exec(jsContent))!==null){
    entityCount++;
    if(entityCount<=3) warn(filename+': HTML entity in JS string may display as literal: '+be[0].slice(0,50));
  }
  if(entityCount>3) warn(filename+': '+entityCount+' total HTML entities in JS strings');

  // 7. BACKTICK TEMPLATE LITERALS with variables - check for syntax issues
  // (template literals with single-quote strings inside are fine, just checking for common issues)

  // 8. Unclosed strings check - simple heuristic
  const lines = jsContent.split('\n');
  lines.forEach((line,i)=>{
    // Check for lines with innerHTML += that contain both ' and " in the same string
    if(line.includes("innerHTML") && line.includes("onclick=") && line.includes("'") && line.includes('"')){
      const singleCount = (line.match(/'/g)||[]).length;
      if(singleCount > 4){
        warn(filename+' line '+(i+1)+': Complex innerHTML with many quotes - review manually');
      }
    }
  });

  // 9. Check for double-declaration of vars (can cause issues)
  const varDecls = {};
  const varRe = /\bvar\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  let vr;
  while((vr=varRe.exec(jsContent))!==null){
    const name = vr[1];
    varDecls[name] = (varDecls[name]||0)+1;
  }
  Object.entries(varDecls).forEach(([name,count])=>{
    if(count>2 && !['i','j','k','r','d','s','btn','el','res','err','div'].includes(name)){
      warn(filename+': var "'+name+'" declared '+count+' times - possible shadowing');
    }
  });

  ok(filename+': Script block analysis complete');
}

async function checkServerJS(src){
  console.log('\nChecking server.js...');

  // 1. Template literals with backticks - check for unclosed
  const backtickCount = (src.match(/`/g)||[]).length;
  if(backtickCount % 2 !== 0){
    fail('server.js: Odd number of backticks ('+backtickCount+') - possible unclosed template literal');
  } else ok('server.js: Backtick count even ('+backtickCount+')');

  // 2. Check all required API routes exist
  const requiredRoutes = [
    ["GET /api/auth/me", "app.get('/api/auth/me'"],
    ["POST /api/auth/login", "app.post('/api/auth/login'"],
    ["GET /api/sessions", "app.get('/api/sessions'"],
    ["POST /api/sessions", "app.post('/api/sessions'"],
    ["GET /api/recordings", "app.get('/api/recordings'"],
    ["POST /api/recordings/upload", "app.post('/api/recordings/upload'"],
    ["GET /api/positions", "app.get('/api/positions'"],
    ["POST /api/positions", "app.post('/api/positions'"],
    ["PATCH /api/recordings/:id/notes", "app.patch('/api/recordings/:id/notes'"],
    ["GET /api/recordings/:id/stream", "app.get('/api/recordings/:id/stream'"],
    ["GET /api/recordings/:id/org-stream", "app.get('/api/recordings/:id/org-stream'"],
    ["PATCH /api/recordings/:id/position", "app.patch('/api/recordings/:id/position'"],
    ["POST /api/recordings/session/:id/sync", "app.post('/api/recordings/session/"],
    ["GET /api/join/:code", "app.get('/api/join/:code'"],
  ];
  requiredRoutes.forEach(([name,pattern])=>{
    if(src.includes(pattern)) ok('server.js: Route exists: '+name);
    else fail('server.js: MISSING route: '+name);
  });

  // 3. Check DB tables exist
  const requiredTables = ['orgs','users','sessions','recordings','flags','job_positions'];
  requiredTables.forEach(t=>{
    if(src.includes('CREATE TABLE IF NOT EXISTS '+t)) ok('server.js: Table: '+t);
    else fail('server.js: MISSING table: '+t);
  });

  // 4. Check migrations exist
  const migrations = ['job_position_id','notes','scheduled_at'];
  migrations.forEach(m=>{
    if(src.includes('ALTER TABLE') && src.includes(m)) ok('server.js: Migration: '+m);
    else fail('server.js: MISSING migration for column: '+m);
  });

  // 5. Check requireAuth is defined
  if(src.includes('function requireAuth') || src.includes('const requireAuth')) ok('server.js: requireAuth defined');
  else fail('server.js: requireAuth not found');

  // 6. Check uuidv4 is used
  if(src.includes('uuidv4()')) ok('server.js: uuidv4 in use');
  else fail('server.js: uuidv4 not found');
}

async function runLiveChecks(){
  console.log('\nLive page checks (run after deploy)...');
  console.log('  NOTE: Run checkLive() separately against the deployed URL');
  console.log('  Use: curl -s https://luca-proctor-fly-v1.fly.dev/ | grep -c SecureInterview');
}

async function main(){
  console.log('========================================');
  console.log('  SECURE INTERVIEW PREFLIGHT CHECK');
  console.log('========================================');

  try {
    const [indexSrc, dashSrc, sesssSrc, candSrc, recsSrc, srvSrc] = await Promise.all([
      getFile('public/pages/index.html'),
      getFile('public/pages/dashboard.html'),
      getFile('public/pages/session.html'),
      getFile('public/pages/candidate.html'),
      getFile('public/pages/recordings.html'),
      getFile('server.js'),
    ]);

    await checkHTML('index.html', indexSrc);
    await checkHTML('dashboard.html', dashSrc);
    await checkHTML('session.html', sesssSrc);
    await checkHTML('candidate.html', candSrc);
    await checkHTML('recordings.html', recsSrc);
    await checkServerJS(srvSrc);

  } catch(e){
    fail('Could not fetch files: ' + e.message);
  }

  console.log('\n========================================');
  console.log('  RESULTS: ' + passed + ' passed, ' + warnings + ' warnings, ' + failed + ' failed');
  console.log('========================================');

  if(errors.length){
    console.error('\nFAILURES:');
    errors.forEach(e=>console.error('  x ' + e));
    console.error('\nDO NOT DEPLOY until all failures are fixed.');
    process.exit(1);
  } else {
    console.log('\nAll checks passed. Safe to deploy.');
    process.exit(0);
  }
}

main().catch(e=>{ console.error('Preflight crashed:', e); process.exit(1); });
