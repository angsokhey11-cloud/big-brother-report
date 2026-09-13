(function(){'use strict';
const URL='https://sjfhlaclgmkwwofzstok.supabase.co';
const KEY='sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
const SESSION_KEY='BB_SUPABASE_DEV_SESSION_V1';
let session=null;
function clean(v){return String(v==null?'':v).trim()}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function esc(v){return clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(v){return '$'+num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function khr(v){return '៛'+num(v).toLocaleString('en-US',{maximumFractionDigits:0})}
function qty(v){return num(v).toLocaleString('en-US',{maximumFractionDigits:6})}
function readSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}}
function saveSession(s){session=s||null;try{if(!s){localStorage.removeItem(SESSION_KEY);return}if(!s.expires_at&&s.expires_in)s.expires_at=Math.floor(Date.now()/1000)+Number(s.expires_in);localStorage.setItem(SESSION_KEY,JSON.stringify(s))}catch(_){}}
async function parse(r){const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(_){d={message:t}}if(!r.ok)throw new Error(d.message||d.error_description||d.error||('Supabase request failed ('+r.status+')'));return d}
async function refresh(){const s=readSession();if(!s?.refresh_token)throw new Error('Please sign in to BIG BROTHER Dashboard first.');const r=await fetch(URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});const next=await parse(r);saveSession(next);return next}
async function ensure(){session=readSession();if(!session?.access_token)throw new Error('Please sign in to BIG BROTHER Dashboard first.');const now=Math.floor(Date.now()/1000);if(session.expires_at&&Number(session.expires_at)<now+30)await refresh();return session}
async function rpc(fn,args={}){await ensure();const r=await fetch(URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(args||{}),cache:'no-store'});return parse(r)}
function monthValue(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function monthParts(v){const m=clean(v).match(/^(\d{4})-(\d{2})$/);if(!m)throw new Error('Choose a report month.');return {year:Number(m[1]),month:Number(m[2])}}
function setupMonth(id){const el=document.getElementById(id);if(el&&!el.value)el.value=monthValue();return el}
function embed(){if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embed')}
function status(id,msg,type=''){const el=document.getElementById(id);if(!el)return;el.hidden=!msg;el.textContent=msg||'';el.className='status'+(type?' '+type:'')}
function loading(id,on,label){const el=document.getElementById(id);if(!el)return;el.hidden=!on;const c=el.querySelector('.loadcard');if(c&&label)c.textContent=label}
function disable(id,on,label){const el=document.getElementById(id);if(!el)return;if(!el.dataset.original)el.dataset.original=el.textContent;el.disabled=!!on;el.textContent=on?(label||'Loading...'):el.dataset.original}
window.BBReport={rpc,clean,num,esc,money,khr,qty,monthParts,setupMonth,embed,status,loading,disable};
embed();
})();