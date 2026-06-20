// utils.js
const $ = id => document.getElementById(id);

async function get(url){const r=await fetch(url,{method:'GET'});return r.json();}
async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();}
async function patch(url,body){const r=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();}

function showModal(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.style.cssText='display:flex!important;position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;background:rgba(0,0,0,0.82)!important;align-items:center!important;justify-content:center!important;z-index:99999!important;';
}
function hideModal(id){
  const el=document.getElementById(id);
  if(el)el.style.cssText='display:none!important;';
}

function toast(msg,type){
  let c=document.getElementById('toast-container');
  if(!c){c=document.createElement('div');c.id='toast-container';Object.assign(c.style,{position:'fixed',bottom:'20px',right:'20px',zIndex:'99999',display:'flex',flexDirection:'column',gap:'8px',pointerEvents:'none'});document.body.appendChild(c);}
  const t=document.createElement('div');
  const colors={green:'#3fb950',red:'#f85149',amber:'#e3b341'};
  const col=colors[type]||'#e6edf3';
  Object.assign(t.style,{background:'#161b22',border:'1px solid '+(colors[type]||'#30363d'),borderRadius:'6px',padding:'10px 16px',fontSize:'13px',color:col,minWidth:'200px',boxShadow:'0 4px 12px rgba(0,0,0,0.5)'});
  t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>t.remove(),3500);
}

function fmtDate(ts){
  if(!ts)return '-';
  return new Date(ts*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

async function requireLogin(back){
  const me=await get('/api/auth/me');
  if(!me||!me.loggedIn){window.location.href=back||'/';return null;}
  return me;
}

function trustClass(score){return score>=80?'trust-hi':score>=60?'trust-mid':'trust-lo';}
