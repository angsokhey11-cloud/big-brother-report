(function buildBBMonthlyDaily(){
'use strict';
const norm=v=>String(v??'').trim().toLocaleLowerCase();
const val=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtQty=n=>val(n).toLocaleString('en-US',{maximumFractionDigits:6});
const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dateText(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?Number(m[3])+'-'+monthNames[Number(m[2])-1]+'-'+m[1]:String(iso||'');
}
function pivot(data,product){
  const members=product?.isGroup?(product.memberRows||[]):product?[product]:[];
  const columns=[],included=new Set();
  for(const p of members){
    const code=String(p.code||'').trim(),key=norm(code);
    if(!key||included.has(key))continue;
    included.add(key);
    columns.push({code,name:String(p.name||code),unit:String(p.unit||'')});
  }
  const byKey=new Map();
  for(const row of (Array.isArray(data?.rows)?data.rows:[])){
    const productKey=norm(row.productCode);
    if(!included.has(productKey))continue;
    const date=String(row.date||''),locationCode=String(row.locationCode||'UNASSIGNED');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const key=date+'\u0001'+norm(locationCode);
    let target=byKey.get(key);
    if(!target){
      target={date,locationCode,locationName:String(row.locationName||locationCode),grossQty:0,returnQty:0,netQty:0,byCode:{}};
      byKey.set(key,target);
    }
    const gross=val(row.grossQty),returns=val(row.returnQty);
    target.grossQty+=gross;
    target.returnQty+=returns;
    target.netQty+=gross-returns;
    target.byCode[productKey]=(target.byCode[productKey]||0)+gross-returns;
  }
  const rows=[...byKey.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.locationName.localeCompare(b.locationName)||a.locationCode.localeCompare(b.locationCode));
  const totals={grossQty:0,returnQty:0,netQty:0,byCode:{}};
  for(const row of rows){
    for(const f of ['grossQty','returnQty','netQty'])totals[f]+=row[f];
    for(const k of Object.keys(row.byCode))totals.byCode[k]=(totals.byCode[k]||0)+row.byCode[k];
  }
  return {rows,columns,totals,dates:new Set(rows.map(r=>r.date)).size,locations:new Set(rows.map(r=>r.locationCode)).size};
}
function renderTable(data,product,{location='',from='',to=''}={}){
  const p=pivot(data,product);
  const rows=p.rows.filter(x=>(!location||x.locationCode===location)&&(!from||x.date>=from)&&(!to||x.date<=to));
  const totals={grossQty:0,returnQty:0,netQty:0,byCode:{}};
  for(const r of rows){
    totals.grossQty+=r.grossQty;totals.returnQty+=r.returnQty;totals.netQty+=r.netQty;
    for(const [code,n] of Object.entries(r.byCode))totals.byCode[code]=(totals.byCode[code]||0)+n;
  }
  const header=`<thead><tr><th>Date</th><th>Location</th><th class="bb-daily-number">Gross Qty</th><th class="bb-daily-number">Returned</th><th class="bb-daily-number">Net Qty</th>${product.isGroup?p.columns.map(c=>`<th class="bb-daily-number" title="${htmlEscape(c.name)}">${htmlEscape(c.name)}<small>${htmlEscape(c.code)}${c.unit?' / '+htmlEscape(c.unit):''}</small></th>`).join(''):''}</tr></thead>`;
  const body=rows.map(r=>`<tr><td class="bb-daily-date">${htmlEscape(dateText(r.date))}</td><td class="bb-daily-location">${htmlEscape(r.locationName)}<small>${htmlEscape(r.locationCode)}</small></td><td class="bb-daily-number">${fmtQty(r.grossQty)}</td><td class="bb-daily-number">${r.returnQty?fmtQty(r.returnQty):'—'}</td><td class="bb-daily-number bb-daily-net">${fmtQty(r.netQty)}</td>${product.isGroup?p.columns.map(c=>`<td class="bb-daily-number">${r.byCode[norm(c.code)]?fmtQty(r.byCode[norm(c.code)]):'—'}</td>`).join(''):''}</tr>`).join('');
  const footer=`<tfoot><tr><th colspan="2">TOTAL</th><th class="bb-daily-number">${fmtQty(totals.grossQty)}</th><th class="bb-daily-number">${fmtQty(totals.returnQty)}</th><th class="bb-daily-number">${fmtQty(totals.netQty)}</th>${product.isGroup?p.columns.map(c=>`<th class="bb-daily-number">${fmtQty(totals.byCode[norm(c.code)]||0)}</th>`).join(''):''}</tr></tfoot>`;
  const table=`<div class="bb-daily-scroll"><table class="bb-daily-table">${header}<tbody>${body||`<tr><td colspan="${5+(product.isGroup?p.columns.length:0)}" class="bb-daily-empty">No sales match the selected date and location.</td></tr>`}</tbody>${footer}</table></div>`;
  return {table,rows,totals,columns:p.columns};
}
function create(opts){
  const root=opts.root,mobile=!!opts.mobile;
  if(!root)throw Error('Daily report container missing');
  const esc=htmlEscape;
  let product=null,report=null,requestId=0,visible=false;
  root.classList.add('bb-daily-root');
  if(mobile)root.classList.add('bb-daily-mobile');
  root.innerHTML=`<div class="bb-daily-picker"><label>Search a product or active product group</label><input class="bb-daily-search" type="search" placeholder="e.g. Champei, Kirisu Milk, KIR-2L" autocomplete="off"><p class="bb-daily-help">Choose a product to show one row per selling date and location. Active groups add a separate column for every sold member SKU.</p><div class="bb-daily-choices"></div></div><div class="bb-daily-result" aria-live="polite"></div>`;
  const lookup=selector=>root.querySelector(selector);
  const input=lookup('.bb-daily-search'), choices=lookup('.bb-daily-choices'),result=lookup('.bb-daily-result');
  let dailyFilter={location:'',from:'',to:''};
  const safeMonth=()=>String(opts.month()||'').trim();
  function candidates(){
    const query=norm(input.value);
    const products=opts.getProducts()||[];
    if(!query){choices.innerHTML='<p class="bb-daily-helper">Search by name or SKU. A group automatically includes its active members.</p>';return;}
    const found=products.filter(p=>window.BBMonthlyProductFamilies.matches(p,query)).slice(0,50);
    choices.innerHTML=found.length?found.map((p,i)=>`<button type="button" data-idx="${i}" class="bb-daily-choice"><strong>${esc(p.name)}</strong><small>${esc(p.code)} · ${p.isGroup?'Active group · '+p.memberRows.length+' sold SKU(s)':'Individual product'}</small></button>`).join(''):'<p class="bb-daily-helper">No product matches this month.</p>';
    for(const el of choices.querySelectorAll('[data-idx]')){
      el.addEventListener('click',()=>select(found[Number(el.dataset.idx)]));
    }
  }
  function reset(){
    requestId++;
    product=null;report=null;dailyFilter={location:'',from:'',to:''};
    result.innerHTML='';
    candidates();
  }
  function setVisible(isVisible,seedQuery=''){
    visible=!!isVisible;
    root.hidden=!visible;
    if(visible&&seedQuery&&!input.value.trim())input.value=seedQuery;
    if(visible)candidates();
  }
  function draw(){
    if(!product||!report)return;
    const d=pivot(report,product);
    const from=String(dailyFilter.from||''),to=String(dailyFilter.to||'');
    const location=String(dailyFilter.location||'');
    const period=safeMonth();
    const ym=period.match(/^(\d{4})-(\d{2})$/);
    const lastDay=ym?new Date(Date.UTC(Number(ym[1]),Number(ym[2]),0)).getUTCDate():31;
    const monthEnd=period+'-'+String(lastDay).padStart(2,'0');
    const locs=[...new Map(d.rows.map(r=>[r.locationCode,r.locationName])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
    const built=renderTable(report,product,{location,from,to});
    const actual=d.totals.netQty,expected=val(product.netQty);
    const gap=Math.abs(actual-expected);
    const mismatch=gap>0.00001;
    const unit=product.mixedUnits?'mixed units':String(product.unit||'units');
    result.innerHTML=`<section class="bb-daily-card"><div class="bb-daily-top"><div><span class="bb-daily-tag">${product.isGroup?'ACTIVE GROUP':'INDIVIDUAL PRODUCT'}</span><h2>${esc(product.name)}</h2><p>${esc(product.code)} · ${esc(unit)} · ${esc(period)}</p></div><div class="bb-daily-total"><small>NET SOLD QTY</small><strong>${product.mixedUnits?'By SKU':fmtQty(actual)}</strong><small>${esc(unit)}</small></div></div>
    ${mismatch?`<div class="bb-daily-warning">Monthly quantity mismatch: summary ${fmtQty(expected)}, daily ${fmtQty(actual)}. Please review sales/returns or refresh the report.</div>`:''}
    <div class="bb-daily-metrics"><span>Gross: <strong>${product.mixedUnits?'By SKU':fmtQty(d.totals.grossQty)}</strong></span><span>Returned: <strong>${product.mixedUnits?'By SKU':fmtQty(d.totals.returnQty)}</strong></span><span>${d.dates} sale/return date(s)</span><span>${d.locations} location(s)</span></div>
    <div class="bb-daily-filter-row"><label>Location<select class="bb-daily-loc"><option value="">All locations</option>${locs.map(([code,name])=>`<option value="${esc(code)}"${code===location?' selected':''}>${esc(name)} (${esc(code)})</option>`).join('')}</select></label><label>From<input class="bb-daily-from" type="date" min="${esc(period+'-01')}" max="${esc(monthEnd)}" value="${esc(from)}"></label><label>To<input class="bb-daily-to" type="date" min="${esc(period+'-01')}" max="${esc(monthEnd)}" value="${esc(to)}"></label></div>
    <div class="bb-daily-count">${built.rows.length} date + location row(s)${product.isGroup?' · '+d.columns.length+' sold SKU column(s)':''}</div>
    ${built.table}<p class="bb-daily-help">Rows combine invoices with the same date and selling location. Gross Qty follows the invoice date; returned Qty follows the return date. Member columns show net quantities. Amounts and original monthly totals are unchanged.</p></section>`;
    lookup('.bb-daily-loc').addEventListener('change',e=>{dailyFilter.location=e.target.value;draw()});
    lookup('.bb-daily-from').addEventListener('change',e=>{dailyFilter.from=e.target.value;draw()});
    lookup('.bb-daily-to').addEventListener('change',e=>{dailyFilter.to=e.target.value;draw()});
  }
  async function select(p){
    if(!p)return;
    const current=++requestId;
    product=p;report=null;dailyFilter={location:'',from:'',to:''};
    choices.innerHTML='';
    result.innerHTML='<div class="bb-daily-loading">Loading daily product sales…</div>';
    try{
      const m=safeMonth().match(/^(\d{4})-(\d{2})$/);
      if(!m)throw Error('Select a report month first.');
      const d=await opts.rpc('bb_report_monthly_product_sold_daily',{p_year:+m[1],p_month:+m[2],p_product_code:p.code});
      if(current!==requestId)return;
      report=d;
      draw();
    }catch(error){
      if(current===requestId)result.innerHTML='<div class="bb-daily-warning">Unable to load daily product sales: '+esc(error?.message||error)+'</div>';
    }
  }
  input.addEventListener('input',()=>{reset()});
  return {setVisible,reset,select,pivot,renderTable};
}
const style=document.createElement('style');
style.textContent=`
.bb-daily-root[hidden]{display:none!important}
.bb-daily-root{margin-top:10px;font-family:Arial,'Noto Sans Khmer',sans-serif}
.bb-daily-picker,.bb-daily-card{background:#fff;border:1px solid #d5e1ed;border-radius:12px;padding:14px;margin-bottom:11px;box-shadow:0 5px 20px rgba(16,52,88,.05)}
.bb-daily-picker>label{display:block;font-size:11px;color:#3d5a76;font-weight:900;margin-bottom:8px}
.bb-daily-search{display:block;width:100%;background:#fff;border:1px solid #c8d8e8;border-radius:9px;font:inherit;font-size:13px;color:#17304f;padding:12px}
.bb-daily-help{font-size:10px;color:#61758b;margin:8px 0;line-height:1.5}
.bb-daily-choices{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.bb-daily-choice{border:1px solid #cbdced;background:#f8fbff;text-align:left;border-radius:9px;padding:10px;min-width:190px;max-width:320px;cursor:pointer}
.bb-daily-choice:hover{background:#e8f2ff}
.bb-daily-choice strong{display:block;color:#173f77;font-size:11px}
.bb-daily-choice small{display:block;font-size:9px;color:#647d96;margin-top:4px;line-height:1.35}
.bb-daily-helper{font-size:10px;color:#647d96}
.bb-daily-top{display:flex;align-items:center;justify-content:space-between;gap:14px}
.bb-daily-top h2{font-size:17px;color:#173f77;margin:6px 0}
.bb-daily-top p{font-size:10px;color:#6c7f92;margin:0}
.bb-daily-tag{font-size:9px;letter-spacing:.2px;font-weight:900;color:#235e93;background:#edf5ff;border:1px solid #c4d9ec;border-radius:6px;padding:4px 7px}
.bb-daily-total{text-align:right;min-width:105px}
.bb-daily-total small{display:block;color:#607990;font-weight:900;font-size:8px}
.bb-daily-total strong{display:block;color:#173f77;font-size:23px;margin:4px 0}
.bb-daily-metrics{display:flex;flex-wrap:wrap;gap:12px;background:#f2f7fd;padding:10px;border-radius:9px;font-size:11px;color:#48627c;margin:14px 0}
.bb-daily-filter-row{display:flex;flex-wrap:wrap;gap:9px;align-items:end;margin:11px 0}
.bb-daily-filter-row label{display:block;color:#4b6683;font-size:9px;font-weight:900}
.bb-daily-filter-row input,.bb-daily-filter-row select{display:block;margin-top:5px;font:inherit;font-size:11px;border:1px solid #cbd9e9;background:#fff;border-radius:8px;padding:8px 9px;max-width:220px;min-height:34px}
.bb-daily-count{font-size:10px;color:#4d6b86;font-weight:900;margin:13px 0 8px}
.bb-daily-scroll{width:100%;overflow-x:auto;border:1px solid #d5e1ed;border-radius:8px}
.bb-daily-table{width:100%;border-collapse:collapse;min-width:640px}
.bb-daily-table th{position:static;white-space:normal;font-size:10px;line-height:1.4;background:#eaf2fc;color:#173f77;border-bottom:1px solid #ceddeb}
.bb-daily-table th small{display:block;font-size:8px;margin-top:4px;color:#637c93;white-space:nowrap}
.bb-daily-table th,.bb-daily-table td{padding:9px 11px;border-bottom:1px solid #e2eaf2}
.bb-daily-table td{font-size:11px}
.bb-daily-table .bb-daily-number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bb-daily-table .bb-daily-net{font-weight:900;color:#17457a}
.bb-daily-table .bb-daily-date{white-space:nowrap;font-weight:800}
.bb-daily-table .bb-daily-location{min-width:120px}
.bb-daily-table .bb-daily-location small{display:block;font-size:9px;color:#657d93;margin-top:3px}
.bb-daily-table tfoot th{font-size:11px;font-weight:900;background:#dae9f8}
.bb-daily-warning{border:1px solid #efc69f;background:#fff6ed;padding:12px;border-radius:8px;font-size:11px;color:#8a4f16;margin:10px 0}
.bb-daily-loading{padding:20px;color:#345b85;font-weight:800;font-size:11px}
.bb-daily-empty{padding:20px;text-align:center;color:#647c93}
.bb-daily-mobile .bb-daily-picker,.bb-daily-mobile .bb-daily-card{padding:11px}
.bb-daily-mobile .bb-daily-top h2{font-size:13px}
.bb-daily-mobile .bb-daily-total strong{font-size:18px}
.bb-daily-mobile .bb-daily-filter-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.bb-daily-mobile .bb-daily-filter-row label:first-child{grid-column:1/-1}
.bb-daily-mobile .bb-daily-filter-row input,.bb-daily-mobile .bb-daily-filter-row select{max-width:100%;width:100%}
@media print{.bb-daily-picker,.bb-daily-filter-row{display:none!important}.bb-daily-card{box-shadow:none}.bb-daily-scroll{overflow:visible}.bb-daily-table{min-width:0!important}}
`;
document.head.appendChild(style);
window.BBMonthlyProductDaily={pivot,renderTable,create};
})();
