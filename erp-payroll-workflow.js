/* ===================================================================
   Civil Master ERP — Payroll Month Workflow Engine
   One shared engine that tracks the lifecycle of each payroll month:
   Uploaded -> Validated -> Supervisor Approved -> Payroll Ready ->
   Payroll Calculated -> Accounts Checked -> Finalized / Locked
   plus a Reopen Request -> Approval -> Reopen -> Re-finalize flow.
   Used by payroll.html, timesheet.html and dashboard.html so every
   module reads / writes the SAME month status.
   =================================================================== */
(function(){
  if(window.CMPW) return;
  const STATUS_KEY = 'cm_payroll_month_status_v1';
  const REOPEN_REQ_KEY = 'cm_payroll_reopen_requests_v1';

  const STAGES = ['Uploaded','Validated','Supervisor Approved','Payroll Ready','Payroll Calculated','Accounts Checked','Finalized'];
  const STAGE_ICON = {Uploaded:'📤',Validated:'✔️','Supervisor Approved':'👤','Payroll Ready':'📋','Payroll Calculated':'🧮','Accounts Checked':'🧾',Finalized:'🔒',Rejected:'↩️'};

  function get(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)); return v??d; }catch(e){ return d; } }
  function set(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function uid(pfx){ return (pfx||'PW')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7); }
  function nowUser(){ return localStorage.getItem('cm_saved_email')||localStorage.getItem('cm_current_user')||'Administrator'; }

  function allStatus(){ return get(STATUS_KEY,{}); }
  function saveAllStatus(m){ set(STATUS_KEY,m); }

  function getMonthStatus(ym){
    const m=allStatus();
    return m[ym] || {month:ym, stage:'Uploaded', locked:false, history:[]};
  }

  function stageIndex(stage){ return STAGES.indexOf(stage); }

  function advanceStage(ym, toStage, remarks, by){
    const m=allStatus();
    const cur=m[ym] || {month:ym, stage:'Uploaded', locked:false, history:[]};
    cur.stage=toStage;
    cur.locked = toStage==='Finalized';
    cur.history = cur.history||[];
    cur.history.unshift({stage:toStage, by:by||nowUser(), at:new Date().toISOString(), remarks:remarks||''});
    m[ym]=cur; saveAllStatus(m);
    return cur;
  }

  function rejectStage(ym, reason, by){
    const m=allStatus();
    const cur=m[ym] || {month:ym, stage:'Uploaded', locked:false, history:[]};
    const fromStage=cur.stage;
    cur.stage='Rejected';
    cur.rejectedFrom=fromStage;
    cur.locked=false;
    cur.history=cur.history||[];
    cur.history.unshift({stage:'Rejected', by:by||nowUser(), at:new Date().toISOString(), remarks:reason||'', fromStage});
    m[ym]=cur; saveAllStatus(m);
    return cur;
  }

  function isLocked(ym){
    const s=getMonthStatus(ym);
    return !!s.locked;
  }

  /* ---------------- Reopen request / approval ---------------- */
  function reopenRequests(){ return get(REOPEN_REQ_KEY,[]); }
  function saveReopenRequests(list){ set(REOPEN_REQ_KEY,list); }

  function requestReopen(ym, reason, by){
    const list=reopenRequests();
    const req={id:uid('RO'), month:ym, requestedBy:by||nowUser(), requestedAt:new Date().toISOString(), reason:reason||'', status:'Pending', approvedBy:'', approvedAt:'', approvalRemarks:'', beforeValue:'', changedValue:'', refinalizedBy:'', refinalizedAt:''};
    list.unshift(req);
    saveReopenRequests(list);
    return req;
  }

  function pendingReopenFor(ym){
    return reopenRequests().find(r=>r.month===ym && r.status==='Pending');
  }
  function approvedUnclosedReopenFor(ym){
    return reopenRequests().find(r=>r.month===ym && r.status==='Approved' && !r.refinalizedAt);
  }

  function approveReopen(id, remarks, by, beforeValueSummary){
    const list=reopenRequests();
    const req=list.find(r=>r.id===id); if(!req) return null;
    req.status='Approved'; req.approvedBy=by||nowUser(); req.approvedAt=new Date().toISOString(); req.approvalRemarks=remarks||''; req.beforeValue=beforeValueSummary||'';
    saveReopenRequests(list);
    // month goes back to Accounts Checked stage — correction + re-check + re-finalize required
    advanceStage(req.month, 'Accounts Checked', 'Reopened for correction: '+req.reason, req.approvedBy);
    const m=allStatus(); if(m[req.month]) m[req.month].locked=false; saveAllStatus(m);
    return req;
  }

  function rejectReopen(id, remarks, by){
    const list=reopenRequests();
    const req=list.find(r=>r.id===id); if(!req) return null;
    req.status='Rejected'; req.approvedBy=by||nowUser(); req.approvedAt=new Date().toISOString(); req.approvalRemarks=remarks||'';
    saveReopenRequests(list);
    return req;
  }

  function recordRefinalize(ym, changedValueSummary, by){
    const req=reopenRequests().find(r=>r.month===ym && r.status==='Approved' && !r.refinalizedAt);
    if(!req) return null;
    const list=reopenRequests();
    const idx=list.findIndex(r=>r.id===req.id);
    list[idx].changedValue=changedValueSummary||'';
    list[idx].refinalizedBy=by||nowUser();
    list[idx].refinalizedAt=new Date().toISOString();
    saveReopenRequests(list);
    return list[idx];
  }

  window.CMPW = {
    STATUS_KEY, REOPEN_REQ_KEY, STAGES, STAGE_ICON,
    getMonthStatus, advanceStage, rejectStage, stageIndex, isLocked, allStatus,
    reopenRequests, requestReopen, pendingReopenFor, approvedUnclosedReopenFor, approveReopen, rejectReopen, recordRefinalize
  };
})();
