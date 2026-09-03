/* ===================================================================
   Civil Master ERP — Central Notification / Action Center Engine
   Scans across every module's data (Employee, Client, Subcontractor,
   CICPA, Leave, Timesheet, Payroll, Site) and produces one unified
   list of actionable notifications with priority, category, a
   New -> Acknowledged -> In Progress -> Resolved workflow, and
   role-based filtering. This is a shared core module — every portal
   (dashboard bell, Universal Search, action-center.html) reads the
   SAME engine so nothing drifts out of sync.
   =================================================================== */
(function(){
  if(window.CMAC) return;
  const STATUS_KEY='cm_action_center_status_v1';
  const CONFIG_KEY='cm_action_center_config_v1';
  const DUE_SOON_DAYS_DEFAULT=30;
  const RETURN_SOON_DAYS=7;

  function get(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)); return v??d; }catch(e){ return d; } }
  function set(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function today(){ return new Date().toISOString().slice(0,10); }
  function addDays(dateStr,n){ const d=new Date(dateStr); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
  function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
  function norm(v){ return String(v??'').trim().toLowerCase(); }

  function getConfig(){ return {dueSoonDays:DUE_SOON_DAYS_DEFAULT, ...get(CONFIG_KEY,{})}; }
  function setConfig(c){ set(CONFIG_KEY,{...getConfig(),...c}); }

  const CATS = {
    critical:{label:'Critical / Immediate Action', icon:'🔴'},
    dueSoon:{label:'Due Soon', icon:'🟠'},
    pending:{label:'Pending Action', icon:'🔵'},
    missing:{label:'Missing Data / Exception', icon:'🟣'},
    manpower:{label:'Manpower / Site Action', icon:'🟢'}
  };
  const ROLES = ['HR','Site','Payroll','Accounts','Admin'];

  function employeeList(){
    const raw=get('cm_employee_portal_v3',{});
    return Array.isArray(raw)?raw:(raw.employees||raw.employeeList||raw.data?.employees||[]);
  }
  function docsOf(e,typeMatch){
    return (e.documents||[]).filter(d=>typeMatch.test(String(d.type||'')));
  }

  function scan(){
    const cfg=getConfig(), dueDays=cfg.dueSoonDays;
    const out=[];
    const push=(cat,role,type,o)=>{
      out.push({
        id:o.id, category:cat, role, type,
        priority:cat==='critical'?'Critical':cat==='dueSoon'?'Due Soon':cat==='pending'?'Pending':cat==='missing'?'Exception':'Manpower',
        employeeCode:o.employeeCode||'', employeeName:o.employeeName||'', company:o.company||'',
        clientProjectSite:o.clientProjectSite||'', dueDate:o.dueDate||'', daysRemaining:o.daysRemaining??'',
        text:o.text, href:o.href||'#', module:o.module||''
      });
    };

    const employees=employeeList();
    const activeEmployees=employees.filter(e=>norm(e.employeeStatus||e.status||'Active')!=='inactive');
    const cicpa=get('cicpa_records',[]);
    const clients=get('cm_client_portal_clients_v1',[]);
    const subs=get('sc_portal_subcontractors_v1',[]);
    const leaves=get('cm_leave_records_v1',[]);
    const moves=get('cm_site_management_movements_v1',[]);
    const central=get('cm_central_timesheet_v1',{});
    const centralRecords=Array.isArray(central.records)?central.records:[];
    const unmatched=Array.isArray(central.unmatched)?central.unmatched:[];
    const payMaster=get('cm_payroll_master_v1',{});
    const siteReq=get('cm_site_manpower_requirement_v1',[]);
    const projects=get('cm_client_portal_projects_v1',[]);
    const projectName=id=>projects.find(p=>String(p.id)===String(id))?.name||'';
    const clientName=id=>clients.find(c=>String(c.id)===String(id))?.name||'';

    // ---------- Employee document expiry (Passport / Visa / EID / CICPA-in-docs) ----------
    activeEmployees.forEach(e=>{
      const code=e.employeeCode||e.empCode||'', name=e.employeeName||e.name||'';
      (e.documents||[]).forEach(d=>{
        if(!d.expiryDate) return;
        const days=daysBetween(today(),d.expiryDate);
        const label=String(d.type||'Document');
        const isPassport=/passport/i.test(label), isVisa=/visa/i.test(label), isEid=/emirates|eid|identity/i.test(label);
        if(!isPassport && !isVisa && !isEid) return;
        const href='index.html?empProfile='+encodeURIComponent(code);
        if(days<0){
          push('critical', 'HR', label+' Expired', {id:'crit-doc-'+code+'-'+label+'-'+d.expiryDate, employeeCode:code, employeeName:name, dueDate:d.expiryDate, daysRemaining:days, text:`${code} – ${name} – ${label} expired ${Math.abs(days)} day(s) ago (on ${d.expiryDate}). Renew immediately.`, href, module:'Employee'});
        }else if(days<=dueDays){
          push('dueSoon', 'HR', label+' Expiring Soon', {id:'due-doc-'+code+'-'+label+'-'+d.expiryDate, employeeCode:code, employeeName:name, dueDate:d.expiryDate, daysRemaining:days, text:`${code} – ${name} – ${label} expires in ${days} day(s) (${d.expiryDate}).`, href, module:'Employee'});
        }
      });
    });

    // ---------- CICPA expiry ----------
    cicpa.forEach(r=>{
      if(!r.expiryDate) return;
      const days=daysBetween(today(),r.expiryDate);
      const href='index.html?empProfile='+encodeURIComponent(r.empCode||'');
      if(days<0){
        push('critical','HR','CICPA Expired',{id:'crit-cicpa-'+r.id, employeeCode:r.empCode, employeeName:r.empName, dueDate:r.expiryDate, daysRemaining:days, text:`${r.empCode} – ${r.empName} – CICPA (${r.cicpaNo||'-'}) expired ${Math.abs(days)} day(s) ago. Renew before site processing.`, href, module:'CICPA'});
      }else if(days<=dueDays){
        push('dueSoon','HR','CICPA Expiring Soon',{id:'due-cicpa-'+r.id, employeeCode:r.empCode, employeeName:r.empName, dueDate:r.expiryDate, daysRemaining:days, text:`${r.empCode} – ${r.empName} – CICPA (${r.cicpaNo||'-'}) expires in ${days} day(s).`, href, module:'CICPA'});
      }
    });

    // ---------- Leave return overdue / returning soon ----------
    leaves.forEach(l=>{
      if(!['Approved','On Leave'].includes(String(l.status||''))) return;
      if(!l.endDate) return;
      const days=daysBetween(today(),l.endDate);
      const href='leave.html';
      if(days<0){
        push('critical','HR','Leave Return Overdue',{id:'crit-leave-'+l.id, employeeCode:l.empCode, employeeName:l.empName, dueDate:l.endDate, daysRemaining:days, text:`${l.empCode} – ${l.empName} – leave return date (${l.endDate}) is overdue by ${Math.abs(days)} day(s).`, href, module:'Leave'});
      }else if(days<=RETURN_SOON_DAYS){
        push('dueSoon','HR','Returning Within 7 Days',{id:'due-leave-'+l.id, employeeCode:l.empCode, employeeName:l.empName, dueDate:l.endDate, daysRemaining:days, text:`${l.empCode} – ${l.empName} – expected to return from leave on ${l.endDate} (${days} day(s)).`, href, module:'Leave'});
      }
      if(String(l.status||'')==='Pending' || String(l.status||'')==='Draft'){
        push('pending','HR','Leave Approval Pending',{id:'pend-leave-'+l.id, employeeCode:l.empCode, employeeName:l.empName, dueDate:l.startDate, text:`${l.empCode} – ${l.empName} – ${l.leaveType||'Leave'} application (${l.startDate} to ${l.endDate}) awaiting approval.`, href, module:'Leave'});
      }
    });

    // ---------- Client / Subcontractor licence ----------
    clients.forEach(c=>{
      const exp=c.tradeExpiry; if(!exp) return;
      const days=daysBetween(today(),exp);
      if(days<0) push('critical','Admin','Client Trade Licence Expired',{id:'crit-cl-'+c.id, company:c.name, dueDate:exp, daysRemaining:days, text:`${c.name} – Trade Licence expired ${Math.abs(days)} day(s) ago.`, href:'client.html', module:'Client'});
      else if(days<=dueDays) push('dueSoon','Admin','Client Trade Licence Expiring',{id:'due-cl-'+c.id, company:c.name, dueDate:exp, daysRemaining:days, text:`${c.name} – Trade Licence expires in ${days} day(s).`, href:'client.html', module:'Client'});
    });
    subs.forEach(s=>{
      const exp=s.tradeExpiry; if(!exp) return;
      const days=daysBetween(today(),exp);
      if(days<0) push('critical','Admin','Subcontractor Licence Expired',{id:'crit-sc-'+s.id, company:s.name, dueDate:exp, daysRemaining:days, text:`${s.name} – Trade Licence expired ${Math.abs(days)} day(s) ago.`, href:'subcontractor.html', module:'Subcontractor'});
      else if(days<=dueDays) push('dueSoon','Admin','Subcontractor Licence Expiring',{id:'due-sc-'+s.id, company:s.name, dueDate:exp, daysRemaining:days, text:`${s.name} – Trade Licence expires in ${days} day(s).`, href:'subcontractor.html', module:'Subcontractor'});
    });

    // ---------- Payroll workflow (needs erp-payroll-workflow.js loaded) ----------
    if(window.CMPW){
      const lastMonthYm=addDays(today().slice(0,8)+'01',-1).slice(0,7);
      const stage=CMPW.getMonthStatus(lastMonthYm).stage;
      if(stage!=='Finalized'){
        push('critical','Payroll','Payroll Month Due',{id:'crit-pay-'+lastMonthYm, dueDate:lastMonthYm, text:`Payroll for ${lastMonthYm} is not yet Finalized (currently "${stage}").`, href:'payroll.html', module:'Payroll'});
      }
      const months=[...new Set([...centralRecords.map(x=>String(x.month||x.date||'').slice(0,7)), ...Object.keys(CMPW.allStatus())])].filter(Boolean);
      months.forEach(m=>{
        const st=CMPW.getMonthStatus(m).stage;
        if(st==='Uploaded') push('pending','Payroll','Timesheet Supervisor Approval Pending',{id:'pend-tssup-'+m, dueDate:m, text:`Timesheet for ${m} is uploaded but not yet validated/supervisor-approved.`, href:'payroll.html', module:'Payroll'});
        if(st==='Payroll Calculated') push('pending','Accounts','Payroll Accounts Check Pending',{id:'pend-acc-'+m, dueDate:m, text:`Payroll for ${m} is calculated and awaiting Accounts verification.`, href:'payroll.html', module:'Payroll'});
      });
      CMPW.reopenRequests().filter(r=>r.status==='Pending').forEach(r=>{
        push('pending','Admin','Reopen Payroll Request Pending',{id:'pend-reopen-'+r.id, dueDate:r.month, text:`Reopen request for ${r.month} by ${r.requestedBy} is awaiting approval. Reason: ${r.reason}`, href:'payroll.html', module:'Payroll'});
      });
    }

    // ---------- Timesheet missing / unmatched ----------
    const ym=today().slice(0,7);
    const monthRecKeys=new Set(centralRecords.filter(x=>String(x.month||x.date||'').startsWith(ym)).map(x=>norm(x.empCode)));
    activeEmployees.forEach(e=>{
      const code=e.employeeCode||e.empCode||''; if(!code) return;
      if(!monthRecKeys.has(norm(code))) push('missing','Payroll','Monthly Timesheet Missing',{id:'miss-ts-'+code+'-'+ym, employeeCode:code, employeeName:e.employeeName||e.name, dueDate:ym, text:`${code} – ${e.employeeName||e.name} – no timesheet record for ${ym} yet.`, href:'index.html?empProfile='+encodeURIComponent(code), module:'Timesheet'});
    });
    unmatched.slice(0,50).forEach(code=>{
      push('missing','Payroll','Timesheet Code Not Matched',{id:'miss-unmatched-'+code, text:`Uploaded timesheet code "${code}" does not match any Employee/Subcontractor master.`, href:'timesheet.html', module:'Timesheet'});
    });

    // ---------- Salary rate missing ----------
    activeEmployees.forEach(e=>{
      const code=e.employeeCode||e.empCode||''; if(!code) return;
      const key='e:'+code;
      if(!(payMaster[key]?.history||[]).length) push('missing','Payroll','Salary Rate Missing',{id:'miss-rate-'+code, employeeCode:code, employeeName:e.employeeName||e.name, text:`${code} – ${e.employeeName||e.name} – no salary/rate setup found for Payroll.`, href:'payroll.html', module:'Payroll'});
    });

    // ---------- Site: mobilization/transfer approval pending, manpower conflicts, shortage ----------
    const activeMoves=moves.filter(m=>!m.demobDate);
    moves.filter(m=>m.requestedBy && !m.approvedBy).forEach(m=>{
      push('pending','Site','Mobilization / Transfer Approval Pending',{id:'pend-mob-'+m.id, employeeCode:m.employeeCode, employeeName:m.employeeName, clientProjectSite:clientName(m.clientId)+' / '+projectName(m.projectId), dueDate:m.mobDate, text:`${m.employeeCode} – ${m.employeeName} – ${m.movementType||'Mobilization'} to ${clientName(m.clientId)} / ${projectName(m.projectId)} requested by ${m.requestedBy}, awaiting approval.`, href:'site.html', module:'Site'});
    });
    const leaveByCode=new Map(); leaves.filter(l=>['Approved','On Leave'].includes(String(l.status||''))&&l.startDate<=today()&&today()<=l.endDate).forEach(l=>leaveByCode.set(norm(l.empCode),l));
    activeMoves.forEach(m=>{
      const lv=leaveByCode.get(norm(m.employeeCode));
      if(lv) push('manpower','Site','On Leave But Still Mobilized',{id:'mp-conflict-'+m.id, employeeCode:m.employeeCode, employeeName:m.employeeName, clientProjectSite:clientName(m.clientId)+' / '+projectName(m.projectId), text:`${m.employeeCode} – ${m.employeeName} – shows Mobilized at ${clientName(m.clientId)} / ${projectName(m.projectId)} but is also on approved leave (${lv.startDate} to ${lv.endDate}). Please verify.`, href:'site.html', module:'Site'});
    });
    const recentlyDemob=moves.filter(m=>m.demobDate && daysBetween(m.demobDate,today())<=14 && daysBetween(m.demobDate,today())>=0);
    recentlyDemob.forEach(m=>{
      const stillInactive=!activeMoves.some(x=>x.employeeKey===m.employeeKey);
      if(stillInactive) push('manpower','Site','Demobilized – New Assignment Pending',{id:'mp-idle-'+m.id, employeeCode:m.employeeCode, employeeName:m.employeeName, dueDate:m.demobDate, text:`${m.employeeCode} – ${m.employeeName} – demobilized on ${m.demobDate}, no new assignment yet (${daysBetween(m.demobDate,today())} day(s)).`, href:'site.html', module:'Site'});
    });
    siteReq.forEach(r=>{
      const actual=activeMoves.filter(m=>String(m.projectId)===String(r.projectId)&&(!r.craft||norm(m.siteCraft)===norm(r.craft))).length;
      const shortage=Number(r.required||0)-actual;
      if(shortage>0) push('manpower','Site','Project Manpower Shortage',{id:'mp-short-'+r.id, clientProjectSite:projectName(r.projectId)+(r.craft?' / '+r.craft:''), text:`${projectName(r.projectId)} – ${r.craft||'Any Craft'} – Required ${r.required} | Mobilized ${actual} | Shortage ${shortage}.`, href:'site.html', module:'Site'});
    });

    return out;
  }

  function syncStatusAndGet(roleFilter){
    const fresh=scan();
    let statusMap=get(STATUS_KEY,{});
    const freshIds=new Set(fresh.map(n=>n.id));
    // auto-resolve anything tracked that no longer appears in a fresh scan
    let changed=false;
    Object.keys(statusMap).forEach(id=>{
      if(!freshIds.has(id) && statusMap[id].status!=='Resolved'){
        statusMap[id]={...statusMap[id], status:'Resolved', resolvedBy:'System', resolvedAt:new Date().toISOString(), remarks:(statusMap[id].remarks?statusMap[id].remarks+' | ':'')+'Auto-resolved — condition no longer applies.'};
        changed=true;
      }
    });
    fresh.forEach(n=>{ if(!statusMap[n.id]){ statusMap[n.id]={status:'New', createdAt:new Date().toISOString()}; changed=true; } });
    if(changed) set(STATUS_KEY,statusMap);
    let merged=fresh.map(n=>({...n, ...statusMap[n.id]}));
    if(roleFilter && roleFilter!=='Admin') merged=merged.filter(n=>n.role===roleFilter);
    return merged;
  }

  function setStatus(id,status,by,remarks){
    let statusMap=get(STATUS_KEY,{});
    const cur=statusMap[id]||{status:'New',createdAt:new Date().toISOString()};
    const upd={...cur,status,updatedAt:new Date().toISOString()};
    if(status==='Resolved'){ upd.resolvedBy=by||'Administrator'; upd.resolvedAt=new Date().toISOString(); }
    if(remarks) upd.remarks=(cur.remarks?cur.remarks+' | ':'')+remarks;
    statusMap[id]=upd;
    set(STATUS_KEY,statusMap);
  }

  window.CMAC = { CATS, ROLES, getConfig, setConfig, scan, syncStatusAndGet, setStatus, STATUS_KEY };
})();
