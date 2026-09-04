/* ================================================================
   CIVIL MASTER ERP — CENTRAL IMPORT STAGING ENGINE
   Standard flow:
   Upload -> Preview -> Matched/New -> Duplicate -> Error -> Warning
   -> User Action -> Confirm Import -> Final Save -> Import History
   ================================================================ */
(function(){
  if(window.CMIS) return;

  const HISTORY_KEY = 'cm_import_staging_history_v1';
  const adapters = {};
  let state = {adapter:null, file:null, context:{}, rows:[], filter:'All', query:'', batchId:''};

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));

  const norm = v => String(v ?? '').trim().toLowerCase().replace(/\s+/g,' ');
  const compact = v => String(v ?? '').trim().toLowerCase().replace(/[\s\-\/_.]/g,'');
  const uid = p => (p||'IMP')+'-'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)+'-'+Math.random().toString(36).slice(2,6).toUpperCase();

  function csvParse(text){
    const rows=[]; let row=[], cur='', q=false;
    text=String(text??'').replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(q){
        if(c==='"' && n==='"'){cur+='"';i++}
        else if(c==='"'){q=false}
        else cur+=c;
      }else{
        if(c==='"') q=true;
        else if(c===','){row.push(cur);cur=''}
        else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur=''}
        else if(c!=='\r') cur+=c;
      }
    }
    row.push(cur); if(row.some(x=>String(x).trim()!=='')) rows.push(row);
    return rows;
  }

  function spreadsheetXml(text){
    const doc=new DOMParser().parseFromString(String(text||''),'application/xml');
    if(doc.querySelector('parsererror')) throw new Error('Spreadsheet XML could not be read.');
    const sheets=[...doc.getElementsByTagNameNS('*','Worksheet')];
    const ws=sheets.find(x=>{
      const nm=x.getAttributeNS('urn:schemas-microsoft-com:office:spreadsheet','Name')||x.getAttribute('ss:Name')||'';
      return /employee|leave|timesheet|cicpa|sub.?contract/i.test(nm);
    }) || sheets[0];
    if(!ws) throw new Error('Worksheet not found.');
    return [...ws.getElementsByTagNameNS('*','Row')].map(row=>{
      const vals=[]; let col=1;
      [...row.getElementsByTagNameNS('*','Cell')].forEach(cell=>{
        const ir=cell.getAttributeNS('urn:schemas-microsoft-com:office:spreadsheet','Index')||cell.getAttribute('ss:Index')||cell.getAttribute('Index');
        const ix=parseInt(ir||'',10); if(Number.isFinite(ix)&&ix>0) col=ix;
        while(vals.length<col-1) vals.push('');
        const d=cell.getElementsByTagNameNS('*','Data')[0];
        vals[col-1]=d?String(d.textContent||'').trim():'';
        col++;
      });
      return vals;
    }).filter(r=>r.some(v=>String(v??'').trim()!==''));
  }

  async function readMatrix(file){
    const name=(file?.name||'').toLowerCase();
    if(!file) throw new Error('Please select a file.');
    if(name.endsWith('.csv')) return csvParse(await file.text());
    if((name.endsWith('.xls')||name.endsWith('.xml'))){
      const txt=await file.text();
      if(/<Workbook[\s>]/i.test(txt)) return spreadsheetXml(txt);
      if(window.XLSX){
        const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''});
      }
      throw new Error('This .xls file is binary. XLSX reader is not loaded; use CSV or the downloaded XML .xls sample.');
    }
    if(name.endsWith('.xlsx')||name.endsWith('.xlsb')){
      if(!window.XLSX) throw new Error('Excel XLSX reader is not loaded. Please check internet connection or use CSV.');
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''});
    }
    throw new Error('Unsupported file. Use .xlsx, .xls or .csv.');
  }

  async function readObjects(file){
    const rows=await readMatrix(file);
    if(!rows.length) return [];
    const headers=(rows[0]||[]).map(x=>String(x??'').trim());
    return rows.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='')).map((r,idx)=>{
      const o={__rowNo:idx+2};
      headers.forEach((h,i)=>{ if(h) o[h]=r[i]??''; });
      return o;
    });
  }

  function style(){
    if(document.getElementById('cmis-style')) return;
    const s=document.createElement('style');s.id='cmis-style';s.textContent=`
    .cmis-overlay{position:fixed;inset:0;background:#0b1f33aa;z-index:120000;display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,Segoe UI,Arial,sans-serif}
    .cmis-shell{width:min(1500px,98vw);height:min(900px,94vh);background:#f5f8fb;border-radius:18px;box-shadow:0 35px 90px #0005;display:flex;flex-direction:column;overflow:hidden}
    .cmis-head{background:linear-gradient(90deg,#123a64,#1c5c94);color:#fff;padding:15px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px}
    .cmis-title b{display:block;font-size:18px}.cmis-title span{font-size:11px;color:#d7e6f3}
    .cmis-x{border:0;background:#ffffff20;color:#fff;border-radius:8px;padding:8px 11px;font-weight:800;cursor:pointer}
    .cmis-summary{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;padding:12px 14px}
    .cmis-stat{background:#fff;border:1px solid #dbe5ed;border-radius:11px;padding:10px;cursor:pointer}
    .cmis-stat small{font-size:9px;text-transform:uppercase;color:#789;display:block;font-weight:900}.cmis-stat b{font-size:22px;color:#173f68}
    .cmis-stat.active{box-shadow:0 0 0 2px #2e6fae55;border-color:#2e6fae}
    .cmis-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:0 14px 10px}
    .cmis-tools input,.cmis-tools select{border:1px solid #cad8e4;border-radius:8px;padding:8px 9px;background:#fff;font-size:12px}
    .cmis-tools input{flex:1;min-width:240px}
    .cmis-btn{border:0;border-radius:8px;padding:9px 12px;font-weight:850;cursor:pointer;background:#1c5c94;color:#fff;font-size:12px}
    .cmis-btn.light{background:#eaf1f7;color:#315a7d}.cmis-btn.green{background:#1f7a4d}.cmis-btn:disabled{opacity:.45;cursor:not-allowed}
    .cmis-tablewrap{margin:0 14px 10px;overflow:auto;background:#fff;border:1px solid #dbe5ed;border-radius:11px;flex:1}
    .cmis-table{width:100%;border-collapse:collapse;font-size:11px;min-width:1050px}
    .cmis-table th{position:sticky;top:0;background:#eaf1f7;color:#49667d;padding:8px;text-align:left;z-index:2;white-space:nowrap}
    .cmis-table td{padding:8px;border-top:1px solid #edf2f6;vertical-align:top}
    .cmis-table tr:hover td{background:#fafcff}.cmis-issue{max-width:360px;color:#5b6e7e}
    .cmis-pill{display:inline-block;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;white-space:nowrap}
    .cmis-New{background:#dcfce7;color:#166534}.cmis-Matched{background:#dbeafe;color:#1d4ed8}.cmis-Duplicate{background:#f3e8ff;color:#7e22ce}.cmis-Warning{background:#fff3cd;color:#8a5b00}.cmis-Error{background:#fee2e2;color:#991b1b}
    .cmis-action{min-width:115px;border:1px solid #cbd8e3;border-radius:7px;padding:6px;background:#fff;font-weight:800;font-size:11px}
    .cmis-foot{background:#fff;border-top:1px solid #dbe5ed;padding:11px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px}
    .cmis-note{font-size:11px;color:#667b8e}.cmis-batch{font-family:monospace;font-weight:800;color:#365a78}
    @media(max-width:900px){.cmis-summary{grid-template-columns:repeat(3,1fr)}.cmis-shell{height:96vh}.cmis-overlay{padding:6px}}
    `;
    document.head.appendChild(s);
  }

  function ensureUI(){
    style();
    let root=document.getElementById('cmis-root');
    if(root) return root;
    root=document.createElement('div');root.id='cmis-root';document.body.appendChild(root);return root;
  }

  function defaultActions(status){
    if(status==='Error'||status==='Duplicate') return ['Skip'];
    if(status==='Matched') return ['Update Existing','Skip'];
    return ['Import','Skip'];
  }

  function normalizeEntry(x,i){
    const status=['New','Matched','Duplicate','Warning','Error'].includes(x.status)?x.status:'Error';
    const acts=(x.actions&&x.actions.length?x.actions:defaultActions(status));
    return {
      id:x.id||('R'+(i+1)), rowNo:x.rowNo??(i+1), status,
      issues:Array.isArray(x.issues)?x.issues.filter(Boolean):[x.issues].filter(Boolean),
      action:x.action&&acts.includes(x.action)?x.action:acts[0],
      actions:acts, display:x.display||{}, normalized:x.normalized??x.data??x,
      meta:x.meta||{}
    };
  }

  function count(status){return state.rows.filter(r=>status==='All'||r.status===status).length}
  function included(){return state.rows.filter(r=>r.action!=='Skip'&&r.status!=='Error'&&r.status!=='Duplicate')}

  function visibleRows(){
    const q=norm(state.query);
    return state.rows.filter(r=>{
      if(state.filter!=='All'&&r.status!==state.filter) return false;
      if(!q) return true;
      return norm([r.rowNo,r.status,Object.values(r.display).join(' '),r.issues.join(' ')].join(' ')).includes(q);
    });
  }

  function render(){
    const root=ensureUI(), a=state.adapter;
    const cols=a.columns||[];
    const statNames=['All','New','Matched','Duplicate','Warning','Error'];
    const rows=visibleRows();
    root.innerHTML=`<div class="cmis-overlay">
      <div class="cmis-shell">
        <div class="cmis-head">
          <div class="cmis-title"><b>${esc(a.title||'Import Staging')}</b><span>${esc(state.file?.name||'')} · Nothing is saved until Confirm Import</span></div>
          <button class="cmis-x" data-cmis="close">✕ Close</button>
        </div>
        <div class="cmis-summary">${statNames.map(s=>`<div class="cmis-stat ${state.filter===s?'active':''}" data-filter="${s}"><small>${s==='All'?'Total Rows':s}</small><b>${count(s)}</b></div>`).join('')}</div>
        <div class="cmis-tools">
          <input id="cmisQ" placeholder="Search staged rows, employee code, status or issue..." value="${esc(state.query)}">
          <select id="cmisFilter">${statNames.map(s=>`<option ${state.filter===s?'selected':''}>${s}</option>`).join('')}</select>
          <button class="cmis-btn light" data-cmis="errors">Show Errors</button>
          <button class="cmis-btn light" data-cmis="dupes">Show Duplicates</button>
          <button class="cmis-btn light" data-cmis="export">Export Issue Report</button>
        </div>
        <div class="cmis-tablewrap"><table class="cmis-table">
          <thead><tr><th>Excel Row</th><th>Status</th>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}<th>Issue / Validation Result</th><th>User Action</th></tr></thead>
          <tbody>${rows.length?rows.map(r=>`<tr>
            <td>${esc(r.rowNo)}</td><td><span class="cmis-pill cmis-${r.status}">${r.status}</span></td>
            ${cols.map(c=>`<td>${esc(typeof c.value==='function'?c.value(r):r.display[c.key]??'')}</td>`).join('')}
            <td class="cmis-issue">${r.issues.length?esc(r.issues.join(' | ')):'Ready for import'}</td>
            <td><select class="cmis-action" data-row="${esc(r.id)}">${r.actions.map(x=>`<option ${r.action===x?'selected':''}>${esc(x)}</option>`).join('')}</select></td>
          </tr>`).join(''):`<tr><td colspan="${cols.length+4}" style="padding:30px;text-align:center;color:#789">No rows in this filter.</td></tr>`}</tbody>
        </table></div>
        <div class="cmis-foot">
          <div class="cmis-note"><span class="cmis-batch">${esc(state.batchId)}</span> · Selected to save: <b>${included().length}</b> · Duplicate/Error rows are blocked by default.</div>
          <div><button class="cmis-btn light" data-cmis="cancel">Cancel</button> <button class="cmis-btn green" data-cmis="confirm" ${included().length?'':'disabled'}>Confirm Import (${included().length})</button></div>
        </div>
      </div></div>`;

    root.querySelectorAll('[data-filter]').forEach(el=>el.onclick=()=>{state.filter=el.dataset.filter;render()});
    root.querySelector('#cmisFilter').onchange=e=>{state.filter=e.target.value;render()};
    root.querySelector('#cmisQ').oninput=e=>{state.query=e.target.value; const pos=e.target.selectionStart; render(); const q2=document.getElementById('cmisQ');q2.focus();q2.setSelectionRange(pos,pos)};
    root.querySelector('[data-cmis="close"]').onclick=close;
    root.querySelector('[data-cmis="cancel"]').onclick=close;
    root.querySelector('[data-cmis="errors"]').onclick=()=>{state.filter='Error';render()};
    root.querySelector('[data-cmis="dupes"]').onclick=()=>{state.filter='Duplicate';render()};
    root.querySelector('[data-cmis="export"]').onclick=exportIssues;
    root.querySelectorAll('.cmis-action').forEach(sel=>sel.onchange=e=>{
      const r=state.rows.find(x=>x.id===e.target.dataset.row); if(r){r.action=e.target.value;render()}
    });
    const c=root.querySelector('[data-cmis="confirm"]'); if(c) c.onclick=confirmImport;
  }

  function close(){const r=document.getElementById('cmis-root');if(r)r.innerHTML='';}

  function exportIssues(){
    const cols=state.adapter.columns||[];
    const head=['Excel Row','Status',...cols.map(c=>c.label),'Issues','Action'];
    const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const data=[head,...state.rows.map(r=>[r.rowNo,r.status,...cols.map(c=>typeof c.value==='function'?c.value(r):r.display[c.key]??''),r.issues.join(' | '),r.action])];
    const csv=data.map(row=>row.map(q).join(',')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download=(state.adapter.key||'Import')+'_Staging_Issue_Report_'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(a.href);
  }

  function saveHistory(result){
    let h=[];try{h=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(!Array.isArray(h))h=[]}catch(e){}
    const counts={};
    ['New','Matched','Duplicate','Warning','Error'].forEach(s=>counts[s]=count(s));
    h.unshift({
      batchId:state.batchId,module:state.adapter.key,file:state.file?.name||'',at:new Date().toISOString(),
      user:localStorage.getItem('cm_saved_email')||localStorage.getItem('cm_current_user')||'Administrator',
      total:state.rows.length,counts,confirmed:included().length,result:result||{}
    });
    if(h.length>500) h=h.slice(0,500);
    localStorage.setItem(HISTORY_KEY,JSON.stringify(h));
  }

  async function confirmImport(){
    const selected=included();
    if(!selected.length) return;
    const ok=confirm(`Confirm Import?\n\nBatch: ${state.batchId}\nRows selected: ${selected.length}\nDuplicate / Error rows will not be saved.\n\nContinue?`);
    if(!ok)return;
    const btn=document.querySelector('[data-cmis="confirm"]');if(btn){btn.disabled=true;btn.textContent='Importing...'}
    try{
      const result=await state.adapter.commit(selected,{batchId:state.batchId,file:state.file,context:state.context,allRows:state.rows});
      saveHistory(result);
      close();
      alert((result&&result.message)||`Import completed successfully. ${selected.length} row(s) processed.`);
      if(typeof state.adapter.afterCommit==='function') state.adapter.afterCommit(result);
    }catch(e){
      console.error(e);alert('Import failed: '+(e?.message||e));render();
    }
  }

  async function stage(adapterKey,file,context){
    const a=adapters[adapterKey];if(!a) throw new Error('Import adapter not registered: '+adapterKey);
    state={adapter:a,file,context:context||{},rows:[],filter:'All',query:'',batchId:uid((a.key||adapterKey).toUpperCase().slice(0,5))};
    try{
      const prepared=await a.prepare(file,state.context,{readMatrix,readObjects,csvParse,spreadsheetXml,norm,compact,uid});
      state.rows=(prepared||[]).map(normalizeEntry);
      if(!state.rows.length) throw new Error('No importable rows found in the file.');
      render();
    }catch(e){
      console.error(e);alert('Staging failed: '+(e?.message||e));
    }
  }

  function registerAdapter(key,adapter){adapters[key]={key,...adapter}}

  function getHeader(row,...names){
    const keys=Object.keys(row||{});
    for(const n of names){
      const k=keys.find(x=>norm(x)===norm(n));if(k!==undefined)return row[k];
    }
    return '';
  }

  function downloadCSV(filename,headers,row){
    const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const csv=[headers,row||headers.map(()=> '')].map(r=>r.map(q).join(',')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=filename;a.click();URL.revokeObjectURL(a.href);
  }

  window.CMIS={registerAdapter,stage,readMatrix,readObjects,csvParse,spreadsheetXml,getHeader,downloadCSV,norm,compact,uid,HISTORY_KEY};
})();