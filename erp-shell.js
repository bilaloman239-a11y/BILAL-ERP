/* ===================================================================
   Civil Master ERP — Shared Shell
   Injects ONE common sidebar + header (back button, breadcrumb,
   universal search, notification bell, user menu) into every module.
   Reads the page's module key from <body data-cm-page="...">.
   Depends on nothing to render; uses CMAC (erp-action-center.js) for
   the notification bell and cm_employee_portal_v3 for people search
   when those are present.
   =================================================================== */
(function(){
  if(window.CMSH) return;

  const MODULES=[
    {key:'dashboard',      href:'dashboard.html',       icon:'⌂', label:'Dashboard',            group:'Management'},
    {key:'approval',       href:'approval.html',        icon:'✓', label:'Approval Center',       group:'Management'},
    {key:'index',          href:'index.html',           icon:'👥', label:'Employee Management',   group:'Core Modules'},
    {key:'leave',          href:'leave.html',           icon:'🏖', label:'Leave Management',      group:'Core Modules'},
    {key:'client',         href:'client.html',          icon:'🏢', label:'Clients & Projects',    group:'Core Modules'},
    {key:'subcontractor',  href:'subcontractor.html',   icon:'🏗', label:'Sub Contractors',       group:'Core Modules'},
    {key:'site',           href:'site.html',            icon:'📍', label:'Site Management',       group:'Core Modules'},
    {key:'timesheet',      href:'timesheet.html',       icon:'🕒', label:'Central Timesheet',     group:'Core Modules'},
    {key:'payroll',        href:'payroll.html',         icon:'💰', label:'Payroll & Salary',      group:'Core Modules'},
    {key:'cicpa',          href:'cicpa.html',           icon:'🛡', label:'CICPA Management',      group:'Core Modules'},
    {key:'validation',     href:'validation.html',      icon:'🧩', label:'Validation & Controls', group:'System'},
    {key:'action-center',  href:'action-center.html',   icon:'🔔', label:'Action Center',         group:'System'},
    {key:'mis',            href:'mis.html',             icon:'📈', label:'Management Reports / MIS', group:'System'},
    {key:'audit',          href:'audit.html',           icon:'📋', label:'Audit Trail',           group:'System'},
    {key:'users',          href:'users.html',           icon:'👤', label:'Users & Roles',         group:'System'},
    {key:'settings',       href:'settings.html',        icon:'⚙', label:'Settings & Masters',    group:'System'}
  ];
  const SESSION_KEY='cm_logged_in_v3';

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function currentUser(){ const u=window.CMSEC&&CMSEC.currentUser&&CMSEC.currentUser(); return u?(u.name||u.email||u.username):(localStorage.getItem('cm_saved_email')||localStorage.getItem('cm_current_user')||'Administrator'); }
  function initialsOf(name){
    const parts=String(name).replace(/@.*/,'').split(/[.\s_]+/).filter(Boolean);
    return ((parts[0]||'A')[0]+(parts[1]?parts[1][0]:'')).toUpperCase();
  }
  function getJSON(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)); return v??d; }catch(e){ return d; } }

  function currentPage(){
    const b=document.body.getAttribute('data-cm-page');
    if(b) return b;
    const file=(location.pathname.split('/').pop()||'dashboard.html').replace('.html','');
    return file==='' ? 'dashboard' : file;
  }

  function buildSidebar(activeKey){
    const groups=['Management','Core Modules','System'];
    const nav=groups.map(g=>{
      const items=MODULES.filter(m=>m.group===g);
      return `<div class="cmsh-nav-title">${esc(g)}</div>`+items.map(m=>
        `<a class="cmsh-link${m.key===activeKey?' active':''}" href="${m.href}"><span class="i">${m.icon}</span>${esc(m.label)}</a>`
      ).join('');
    }).join('');
    const el=document.createElement('aside');
    el.className='cmsh-sidebar';
    el.innerHTML=`
      <div class="cmsh-brand"><b><span>CIVIL</span> <span class="o">MASTER</span></b><span>Integrated ERP Management System</span></div>
      <nav class="cmsh-nav">${nav}</nav>
      <div class="cmsh-sidebar-foot">Live Browser Data<br>Employee • Project • Site • Payroll</div>`;
    return el;
  }

  function employeeMatches(term){
    const raw=getJSON('cm_employee_portal_v3',{});
    const list=Array.isArray(raw)?raw:(raw.employees||raw.employeeList||raw.data?.employees||[]);
    if(!Array.isArray(list)) return [];
    const t=term.toLowerCase();
    return list.filter(e=>{
      const code=String(e.employeeCode||e.empCode||'').toLowerCase();
      const name=String(e.employeeName||e.name||'').toLowerCase();
      return code.includes(t)||name.includes(t);
    }).slice(0,6).map(e=>({
      label:e.employeeName||e.name||'(unnamed)',
      sub:e.employeeCode||e.empCode||'',
      href:'index.html?empProfile='+encodeURIComponent(e.employeeCode||e.empCode||'')
    }));
  }

  function buildHeader(activeKey){
    const mod=MODULES.find(m=>m.key===activeKey);
    const el=document.createElement('header');
    el.className='cmsh-header';
    el.innerHTML=`
      <button type="button" class="cmsh-burger" id="cmshBurger" title="Menu">☰</button>
      <button type="button" class="cmsh-back" id="cmshBack" title="Go back">← Back</button>
      <div class="cmsh-crumb">Civil Master ERP <span>›</span> <b>${esc(mod?mod.label:'')}</b></div>
      <div class="cmsh-search cmsh-anchor">
        <span class="ic">🔎</span>
        <input id="cmshSearchInput" type="text" placeholder="Search modules or employees...">
        <div class="cmsh-search-panel" id="cmshSearchPanel"></div>
      </div>
      <div class="cmsh-spacer"></div>
      <div class="cmsh-anchor">
        <button type="button" class="cmsh-icon-btn" id="cmshBellBtn" title="Notifications">🔔<span class="cmsh-badge" id="cmshBellBadge" style="display:none">0</span></button>
        <div class="cmsh-panel" id="cmshBellPanel"></div>
      </div>
      <div class="cmsh-anchor">
        <button type="button" class="cmsh-user" id="cmshUserBtn">
          <span class="cmsh-avatar" id="cmshAvatar">A</span>
          <span class="cmsh-user-name" id="cmshUserName">Administrator<small>View profile</small></span>
        </button>
        <div class="cmsh-user-panel" id="cmshUserPanel">
          <a href="dashboard.html">⌂ Dashboard</a>
          <a href="action-center.html">🔔 Action Center</a>
          <button type="button" class="logout" id="cmshLogout">↩ Logout</button>
        </div>
      </div>`;
    return el;
  }

  function wireSearch(){
    const input=document.getElementById('cmshSearchInput');
    const panel=document.getElementById('cmshSearchPanel');
    if(!input) return;
    function render(term){
      const t=term.trim().toLowerCase();
      if(!t){ panel.classList.remove('open'); panel.innerHTML=''; return; }
      const mods=MODULES.filter(m=>m.label.toLowerCase().includes(t)).slice(0,6);
      const emps=employeeMatches(t);
      let html='';
      if(mods.length){
        html+='<div class="cmsh-search-group-label">Modules</div>'+mods.map(m=>
          `<a class="cmsh-search-item" href="${m.href}">${m.icon} ${esc(m.label)}</a>`).join('');
      }
      if(emps.length){
        html+='<div class="cmsh-search-group-label">Employees</div>'+emps.map(e=>
          `<a class="cmsh-search-item" href="${e.href}">${esc(e.label)}<small>${esc(e.sub)}</small></a>`).join('');
      }
      if(!html) html='<div class="cmsh-search-empty">No matches. Try a module name or employee code.</div>';
      panel.innerHTML=html;
      panel.classList.add('open');
    }
    input.addEventListener('input',()=>render(input.value));
    input.addEventListener('focus',()=>{ if(input.value) render(input.value); });
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        const first=panel.querySelector('.cmsh-search-item');
        if(first){ location.href=first.getAttribute('href'); }
      }else if(e.key==='Escape'){ panel.classList.remove('open'); input.blur(); }
    });
    document.addEventListener('click',e=>{
      if(!panel.contains(e.target) && e.target!==input) panel.classList.remove('open');
    });
  }

  function catDot(cat){
    return {critical:'#c2453a',dueSoon:'#c99a12',pending:'#2e6fae',missing:'#7a4fc9',manpower:'#2d9151'}[cat]||'#7b8d9d';
  }

  function refreshBell(){
    const badge=document.getElementById('cmshBellBadge');
    const panel=document.getElementById('cmshBellPanel');
    if(!badge||!panel) return;
    if(!window.CMAC){ badge.style.display='none'; panel.innerHTML='<div class="cmsh-panel-head">Notifications</div><div class="cmsh-notif-row">Action Center not loaded on this page.</div>'; return; }
    let list=[];
    try{ list=window.CMAC.syncStatusAndGet('Admin')||[]; }catch(e){ list=[]; }
    const open=list.filter(n=>n.status!=='Resolved');
    if(open.length){ badge.style.display='flex'; badge.textContent=open.length>99?'99+':String(open.length); }
    else{ badge.style.display='none'; }
    const top=open.sort((a,b)=>(a.daysRemaining??999)-(b.daysRemaining??999)).slice(0,6);
    panel.innerHTML='<div class="cmsh-panel-head">Notifications<a href="action-center.html">View all</a></div>'+
      (top.length?top.map(n=>`<a class="cmsh-notif-row" style="display:block;text-decoration:none;color:inherit" href="${esc(n.href||'action-center.html')}">
        <span class="cmsh-dot" style="background:${catDot(n.category)}"></span><b>${esc(n.type||'')}</b>
        <div class="meta">${esc(n.text||'')}</div></a>`).join(''):
        '<div class="cmsh-notif-row">You\'re all caught up — no open items.</div>');
  }

  function wirePanel(btnId,panelId,onOpen){
    const btn=document.getElementById(btnId), panel=document.getElementById(panelId);
    if(!btn||!panel) return;
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const willOpen=!panel.classList.contains('open');
      document.querySelectorAll('.cmsh-panel.open,.cmsh-user-panel.open').forEach(p=>p.classList.remove('open'));
      if(willOpen){ if(onOpen) onOpen(); panel.classList.add('open'); }
    });
    document.addEventListener('click',e=>{ if(!panel.contains(e.target) && e.target!==btn) panel.classList.remove('open'); });
  }

  function wireUser(){
    const name=currentUser();
    const display=name.includes('@')?name.split('@')[0]:name;
    document.getElementById('cmshAvatar').textContent=initialsOf(name);
    document.getElementById('cmshUserName').innerHTML=esc(display)+'<small>'+esc((window.CMSEC&&CMSEC.currentRole&&CMSEC.currentRole())||'User')+'</small>';
    document.getElementById('cmshLogout').addEventListener('click',()=>{
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      if(window.CMSEC) CMSEC.logout();
      location.href='index.html';
    });
  }

  function wireBack(){
    document.getElementById('cmshBack').addEventListener('click',()=>{
      if(document.referrer && document.referrer.indexOf(location.host)!==-1) history.back();
      else location.href='dashboard.html';
    });
  }

  function wireMobileNav(){
    const overlay=document.createElement('div');
    overlay.className='cmsh-overlay';
    document.body.appendChild(overlay);
    const burger=document.getElementById('cmshBurger');
    function close(){ document.body.classList.remove('cmsh-nav-open'); }
    burger.addEventListener('click',()=>document.body.classList.toggle('cmsh-nav-open'));
    overlay.addEventListener('click',close);
  }

  /* ---------------- Deep-link: open the exact record a notification points to ----------------
     Action Center / bell links carry module-specific query params (e.g. leave.html?leaveId=..).
     Each page already has its own "open/edit/view" function and, where relevant, its own
     view-switcher — this just calls into those with the id from the URL, then scrolls to and
     flashes the matching row/panel so the person lands on the exact record, not just the module
     home screen. Safe to run on every page: it's a no-op when none of its params are present. */
  function highlight(el){
    if(!el) return;
    el.classList.remove('cmsh-hit'); void el.offsetWidth; // restart animation if re-triggered
    el.classList.add('cmsh-hit');
    el.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>el.classList.remove('cmsh-hit'),2700);
  }
  function highlightRow(selector){
    const el=document.querySelector(selector);
    if(el) highlight(el);
    return el;
  }
  function highlightRowContaining(text,rowSelector){
    if(!text) return null;
    const rows=document.querySelectorAll(rowSelector||'tbody tr');
    const needle=String(text).toLowerCase();
    for(const row of rows){
      if(row.textContent.toLowerCase().includes(needle)){ highlight(row); return row; }
    }
    return null;
  }
  function switchToView(viewId){
    if(!viewId || !window.showView) return;
    const btn=document.querySelector(`[data-view="${viewId}"]`);
    try{ window.showView(viewId, btn||undefined); }catch(e){}
  }
  function cleanUrl(keys){
    try{
      const url=new URL(location.href);
      keys.forEach(k=>url.searchParams.delete(k));
      history.replaceState({},'',url);
    }catch(e){}
  }

  const DEEPLINK={
    cicpa(p){
      const id=p.get('cicpaId'); if(!id) return;
      if(typeof window.editRecord==='function') window.editRecord(id);
      cleanUrl(['cicpaId']);
    },
    leave(p){
      const id=p.get('leaveId'); if(!id) return;
      if(typeof window.editLeave==='function') window.editLeave(id);
      cleanUrl(['leaveId']);
    },
    client(p){
      const id=p.get('clientId'); if(!id) return;
      if(typeof window.viewClient==='function') window.viewClient(id);
      cleanUrl(['clientId']);
    },
    subcontractor(p){
      const id=p.get('scId'); if(!id) return;
      if(typeof window.editSub==='function') window.editSub(id);
      cleanUrl(['scId']);
    },
    payroll(p){
      const view=p.get('view'), month=p.get('month'), empCode=p.get('empCode');
      if(month && document.getElementById('payMonth')){
        document.getElementById('payMonth').value=month;
        if(typeof window.calculatePayroll==='function') window.calculatePayroll();
        if(typeof window.renderWorkflowPanel==='function') window.renderWorkflowPanel();
        if(typeof window.renderPaymentSummary==='function') window.renderPaymentSummary();
      }
      if(view) switchToView(view);
      if(empCode && document.getElementById('rateSearch')){
        document.getElementById('rateSearch').value=empCode;
        if(typeof window.renderRateHistory==='function') window.renderRateHistory();
        setTimeout(()=>highlightRow('#rateRows tr'),120);
      }else if(month){
        setTimeout(()=>highlightRow('#workflowPanel'),120);
      }
      cleanUrl(['view','month','empCode']);
    },
    site(p){
      const view=p.get('view')||'onsite', moveId=p.get('moveId'), reqId=p.get('reqId');
      switchToView(view);
      setTimeout(()=>{
        if(moveId) highlightRow(`tr[data-move-id="${moveId}"]`);
        if(reqId) highlightRow(`tr[data-req-id="${reqId}"]`);
      },150);
      cleanUrl(['view','moveId','reqId']);
    },
    timesheet(p){
      const code=p.get('unmatched'); if(!code) return;
      switchToView && document.getElementById('batchRows');
      setTimeout(()=>highlightRowContaining(code,'#batchRows tr'),150);
      cleanUrl(['unmatched']);
    },
    index(p){
      // empProfile is already handled by index.html itself (opens the profile modal);
      // this only adds the tab-jump + document-row highlight on top of that.
      const tab=p.get('tab'), doc=p.get('doc');
      if(!tab && !doc) return;
      const tryJump=(attemptsLeft)=>{
        const modal=document.getElementById('employeeProfileModal');
        if(modal && !modal.classList.contains('hidden')){
          if(tab){
            const btn=document.querySelector(`.profile-tab[data-profile-tab="${tab}"]`);
            if(btn) btn.click();
          }
          if(doc){
            setTimeout(()=>{
              const docs=document.querySelectorAll('#profile-documents .profile-doc');
              for(const d of docs){ if(d.textContent.toLowerCase().includes(String(doc).toLowerCase())){ highlight(d); break; } }
            },100);
          }
          cleanUrl(['tab','doc']);
        }else if(attemptsLeft>0){
          setTimeout(()=>tryJump(attemptsLeft-1),200);
        }
      };
      tryJump(15);
    }
  };

  function runDeepLink(activeKey){
    const handler=DEEPLINK[activeKey];
    if(!handler) return;
    const params=new URLSearchParams(location.search);
    try{ handler(params); }catch(e){ console.warn('CMSH deep-link skipped',e); }
  }

  function init(){
    const activeKey=currentPage();
    document.body.appendChild(buildSidebar(activeKey));
    document.body.appendChild(buildHeader(activeKey));
    wireSearch();
    wirePanel('cmshBellBtn','cmshBellPanel',refreshBell);
    wirePanel('cmshUserBtn','cmshUserPanel',null);
    wireUser();
    wireBack();
    wireMobileNav();
    refreshBell();
    setTimeout(refreshBell,800); // in case CMAC / employee data finished loading a beat later
    runDeepLink(activeKey);
  }

  window.CMSH={init, highlightRow, highlightRowContaining};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
