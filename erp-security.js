/* ===================================================================
   Civil Master ERP — User, Role & Permission Security Layer
   Local prototype security. For production with Supabase, mirror these
   permissions in database RLS / server-side policies.
   =================================================================== */
(function(){
  if(window.CMSEC) return;

  const USERS_KEY='cm_security_users_v1';
  const ROLES_KEY='cm_security_roles_v1';
  const SESSION_KEY='cm_security_session_v1';
  const LEGACY_SESSION_KEY='cm_logged_in_v3';
  const ACTIONS=['View','Add','Edit','Delete','Approve','Export','Reopen','Finalize'];
  const MODULES=[
    {key:'dashboard',label:'Dashboard'},
    {key:'approval',label:'Approval Center'},
    {key:'index',label:'Employee Management'},
    {key:'leave',label:'Leave Management'},
    {key:'client',label:'Clients & Projects'},
    {key:'subcontractor',label:'Sub Contractors'},
    {key:'site',label:'Site Management'},
    {key:'timesheet',label:'Central Timesheet'},
    {key:'payroll',label:'Payroll & Salary'},
    {key:'cicpa',label:'CICPA Management'},
    {key:'validation',label:'Validation & Controls'},
    {key:'action-center',label:'Action Center'},
    {key:'mis',label:'Management Reports / MIS'},
    {key:'audit',label:'Audit Trail'},
    {key:'users',label:'Users & Roles'},
    {key:'settings',label:'Settings & Masters'}
  ];

  const allFalse=()=>Object.fromEntries(ACTIONS.map(a=>[a,false]));
  const full=()=>Object.fromEntries(ACTIONS.map(a=>[a,true]));
  const row=(...allowed)=>Object.fromEntries(ACTIONS.map(a=>[a,allowed.includes(a)]));

  function defaultRoles(){
    return {
      Admin:Object.fromEntries(MODULES.map(m=>[m.key,full()])),
      HR:{
        dashboard:row('View'),approval:row('View'),index:row('View','Add','Edit','Delete','Export'),
        leave:row('View','Add','Edit','Delete','Export'),client:row('View'),subcontractor:row('View'),
        site:row('View'),timesheet:row('View','Export'),payroll:row(),cicpa:row('View','Add','Edit','Delete','Export'),
        validation:row('View'), 'action-center':row('View'),mis:row('View','Export'),audit:row('View'),users:row()
      },
      Accounts:{
        dashboard:row('View'),approval:row('View'),index:row('View','Export'),
        leave:row('View','Edit','Export'),client:row('View'),subcontractor:row('View','Export'),
        site:row('View'),timesheet:row('View','Export'),payroll:row('View','Add','Edit','Delete','Export','Finalize'),
        cicpa:row('View','Export'),validation:row('View'),'action-center':row('View'),mis:row('View','Export'),audit:row('View'),users:row()
      },
      Site:{
        dashboard:row('View'),approval:row('View'),index:row('View'),
        leave:row('View'),client:row('View'),subcontractor:row('View'),site:row('View','Add','Edit','Delete','Export'),
        timesheet:row('View','Add','Edit','Delete','Export'),payroll:row(),cicpa:row('View'),
        validation:row(),'action-center':row('View'),mis:row('View'),audit:row(),users:row()
      },
      Payroll:{
        dashboard:row('View'),approval:row('View'),index:row('View'),
        leave:row('View'),client:row('View'),subcontractor:row('View'),site:row('View'),
        timesheet:row('View','Add','Edit','Delete','Export'),payroll:row('View','Add','Edit','Delete','Export','Finalize'),
        cicpa:row('View'),validation:row('View'),'action-center':row('View'),mis:row('View','Export'),audit:row('View'),users:row()
      },
      Manager:{
        dashboard:row('View'),approval:row('View','Approve'),index:row('View','Export'),
        leave:row('View','Approve','Export'),client:row('View'),subcontractor:row('View'),
        site:row('View','Approve'),timesheet:row('View','Approve','Export'),payroll:row('View','Approve','Reopen','Export'),
        cicpa:row('View','Approve'),validation:row('View'),'action-center':row('View'),mis:row('View','Export'),audit:row('View'),users:row()
      },
      Viewer:{
        dashboard:row('View'),approval:row(),index:row('View'),leave:row('View'),client:row('View'),
        subcontractor:row('View'),site:row('View'),timesheet:row('View'),payroll:row(),cicpa:row('View'),
        validation:row(),'action-center':row(),mis:row('View'),audit:row(),users:row()
      }
    };
  }

  // Lightweight local hash. It protects against casual password display only.
  // Static localStorage is not a secure authentication backend.
  function hash(s){
    s='CMERP|'+String(s??'');
    let h1=0x811c9dc5,h2=0x9e3779b9,h3=0x85ebca6b,h4=0xc2b2ae35;
    for(let i=0;i<s.length;i++){
      const c=s.charCodeAt(i);
      h1=Math.imul(h1^c,16777619); h2=Math.imul(h2+c,2246822519);
      h3=Math.imul(h3^((c<<5)|c),3266489917); h4=Math.imul(h4+(c^i),668265263);
    }
    const z=n=>(n>>>0).toString(16).padStart(8,'0');
    return z(h1)+z(h2)+z(h3)+z(h4);
  }

  function get(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch(e){return d}}
  function set(k,v){localStorage.setItem(k,JSON.stringify(v))}
  function now(){return new Date().toISOString()}
  function uid(){return 'USR-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}

  function normalizeMatrix(src){
    const out={};
    MODULES.forEach(m=>{
      out[m.key]={...allFalse(),...(src?.[m.key]||{})};
      ACTIONS.forEach(a=>out[m.key][a]=!!out[m.key][a]);
    });
    return out;
  }

  function seed(){
    let roles=get(ROLES_KEY,null);
    if(!roles){
      roles=defaultRoles(); Object.keys(roles).forEach(r=>roles[r]=normalizeMatrix(roles[r])); set(ROLES_KEY,roles);
    }else{
      Object.keys(defaultRoles()).forEach(r=>{if(!roles[r])roles[r]=defaultRoles()[r]});
      Object.keys(roles).forEach(r=>roles[r]=normalizeMatrix(roles[r])); set(ROLES_KEY,roles);
    }
    let users=get(USERS_KEY,null);
    if(!Array.isArray(users)||!users.length){
      users=[{
        id:uid(),username:'admin',email:'admin@civilmastergm.com',name:'Administrator',
        role:'Admin',passwordHash:hash('Civil123@2024'),active:true,createdAt:now(),mustChangePassword:false
      }];
      set(USERS_KEY,users);
    }
  }
  seed();

  function roles(){return get(ROLES_KEY,{})}
  function users(){return get(USERS_KEY,[])}
  function saveUsers(v){set(USERS_KEY,v)}
  function saveRoles(v){Object.keys(v||{}).forEach(r=>v[r]=normalizeMatrix(v[r]));set(ROLES_KEY,v)}

  function session(){
    const s=get(SESSION_KEY,null);
    if(!s||!s.userId)return null;
    const u=users().find(x=>x.id===s.userId&&x.active!==false);
    if(!u)return null;
    return {...s,user:u};
  }
  function currentUser(){return session()?.user||null}
  function currentRole(){return currentUser()?.role||''}
  function syncLegacy(){
    const u=currentUser(); if(!u)return;
    localStorage.setItem('cm_current_user',u.email||u.username||u.name||'');
    localStorage.setItem('cm_current_role',u.role||'');
    localStorage.setItem('cm_user_role',u.role||'');
    sessionStorage.setItem(LEGACY_SESSION_KEY,'1');
  }

  function login(id,password,keep){
    const q=String(id??'').trim().toLowerCase();
    const u=users().find(x=>x.active!==false&&(String(x.username||'').toLowerCase()===q||String(x.email||'').toLowerCase()===q));
    if(!u||u.passwordHash!==hash(password))return {ok:false,message:'Invalid username/email or password.'};
    const s={userId:u.id,loginAt:now(),keep:!!keep};
    set(SESSION_KEY,s); syncLegacy();
    if(keep)localStorage.setItem(LEGACY_SESSION_KEY,'1');else localStorage.removeItem(LEGACY_SESSION_KEY);
    return {ok:true,user:u};
  }
  function logout(){
    localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(LEGACY_SESSION_KEY);localStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem('cm_current_user');localStorage.removeItem('cm_current_role');localStorage.removeItem('cm_user_role');
  }

  function can(module,action,user){
    user=user||currentUser(); if(!user||user.active===false)return false;
    const matrix=roles()[user.role]||{};
    return !!matrix?.[module]?.[action];
  }

  function pageModule(){
    return document.body?.getAttribute('data-cm-page')||'';
  }

  function auditSecurity(action,detail){
    try{
      let a=get('cm_security_audit_v1',[]);
      a.unshift({id:'SEC-'+Date.now().toString(36),at:now(),user:currentUser()?.email||currentUser()?.username||'Unknown',role:currentRole(),action,detail:detail||'',page:location.pathname.split('/').pop()});
      if(a.length>2000)a=a.slice(0,2000);set('cm_security_audit_v1',a);
    }catch(e){}
  }

  function denied(module,action){
    auditSecurity('Permission Denied',`${module}:${action}`);
    alert(`Access denied.\n\nRole: ${currentRole()||'None'}\nRequired permission: ${action} — ${MODULES.find(x=>x.key===module)?.label||module}`);
  }

  function actionFromElement(el){
    if(!el)return null;
    const explicit=el.closest?.('[data-cm-action]')?.getAttribute('data-cm-action');
    if(explicit)return explicit;
    const x=(String(el.textContent||'')+' '+String(el.getAttribute?.('title')||'')+' '+String(el.getAttribute?.('onclick')||'')+' '+String(el.id||'')).toLowerCase();
    if(/\breopen\b/.test(x))return'Reopen';
    if(/\bfinali[sz]e\b|\block month\b|\bfinalized\b/.test(x))return'Finalize';
    if(/\bapprove\b|\breject\b|\bapproval\b/.test(x))return'Approve';
    if(/\bdelete\b|\bremove\b|\btrash\b/.test(x))return'Delete';
    if(/\bexport\b|\bdownload\b|\bprint\b/.test(x))return'Export';
    if(/\bedit\b|\bupdate\b|\btransfer\b|\bdemobilize\b|\breturn(ed)?\b/.test(x))return'Edit';
    if(/\badd\b|\bnew\b|\bcreate\b|\bimport\b|\bupload\b|\bsave\b|\bmobilize\b/.test(x))return'Add';
    return null;
  }

  function protectClicks(){
    document.addEventListener('click',function(e){
      const el=e.target.closest?.('button,a,[role="button"],input[type="submit"]');if(!el)return;
      const mod=el.closest?.('[data-cm-module]')?.getAttribute('data-cm-module')||pageModule();
      const act=actionFromElement(el);
      if(act&&!can(mod,act)){e.preventDefault();e.stopImmediatePropagation();denied(mod,act)}
    },true);
    document.addEventListener('submit',function(e){
      const mod=e.target.closest?.('[data-cm-module]')?.getAttribute('data-cm-module')||pageModule();
      if(!can(mod,'Add')&&!can(mod,'Edit')){e.preventDefault();e.stopImmediatePropagation();denied(mod,'Edit')}
    },true);
  }

  function markDom(){
    const mod=pageModule(); if(!mod)return;
    document.querySelectorAll('[data-cm-action]').forEach(el=>{
      const m=el.closest('[data-cm-module]')?.getAttribute('data-cm-module')||mod;
      if(!can(m,el.getAttribute('data-cm-action'))){el.disabled=true;el.classList.add('cmsec-disabled');el.setAttribute('title','Permission denied for '+currentRole())}
    });
    document.querySelectorAll('button').forEach(el=>{
      const a=actionFromElement(el);if(a&&!can(mod,a)){el.disabled=true;el.classList.add('cmsec-disabled')}
    });
  }

  function applySensitive(){
    const role=currentRole();
    // Accounts may VIEW employees but cannot modify employee personal/document data.
    if(role==='Accounts'&&pageModule()==='index'){
      document.documentElement.classList.add('cmsec-employee-readonly');
    }
    // Site/HR must not see commercial/payroll rates on Site page.
    if((role==='Site'||role==='HR'||role==='Viewer')&&pageModule()==='site'){
      document.documentElement.classList.add('cmsec-hide-site-rates');
    }
    // Leave Accounts section follows actual signed-in role instead of a viewing filter.
    if(pageModule()==='leave'){
      setTimeout(()=>{
        const sec=document.getElementById('accountsSection');
        if(sec){
          const allowed=['Admin','Accounts'].includes(role);
          sec.classList.toggle('show',allowed);
          if(!allowed)sec.style.display='none';
        }
      },0);
    }
  }

  function injectStyle(){
    if(document.getElementById('cmsec-style'))return;
    const s=document.createElement('style');s.id='cmsec-style';s.textContent=`
      .cmsec-disabled{opacity:.42!important;cursor:not-allowed!important;filter:grayscale(.35)}
      .cmsec-denied{min-height:100vh;display:grid;place-items:center;padding:30px;background:#f2f6fa;font-family:Inter,Arial,sans-serif}
      .cmsec-denied .box{max-width:620px;background:#fff;border:1px solid #dbe5ed;border-radius:18px;padding:28px;box-shadow:0 20px 60px #123a6420;text-align:center}
      .cmsec-denied h1{color:#b43a35}.cmsec-denied p{color:#607589}.cmsec-denied a{display:inline-block;background:#1c5c94;color:#fff;text-decoration:none;padding:10px 14px;border-radius:9px;font-weight:800}
      html.cmsec-hide-site-rates body[data-cm-page="site"] label[for="mobClientRate"],
      html.cmsec-hide-site-rates body[data-cm-page="site"] #mobClientRate,
      html.cmsec-hide-site-rates body[data-cm-page="site"] label[for="mobSubRate"],
      html.cmsec-hide-site-rates body[data-cm-page="site"] #mobSubRate{display:none!important}
      html.cmsec-hide-site-rates body[data-cm-page="site"] #site table th:nth-child(8),
      html.cmsec-hide-site-rates body[data-cm-page="site"] #site table td:nth-child(8),
      html.cmsec-hide-site-rates body[data-cm-page="site"] #site table th:nth-child(9),
      html.cmsec-hide-site-rates body[data-cm-page="site"] #site table td:nth-child(9),
      html.cmsec-hide-site-rates body[data-cm-page="site"] #report table th:nth-child(11),
      html.cmsec-hide-site-rates body[data-cm-page="site"] #report table td:nth-child(11),
      html.cmsec-hide-site-rates body[data-cm-page="site"] #report table th:nth-child(12),
      html.cmsec-hide-site-rates body[data-cm-page="site"] #report table td:nth-child(12){display:none!important}
    `;document.head.appendChild(s);
  }

  function requirePageAccess(){
    const mod=pageModule();
    if(mod==='index')return true; // login lives here; app itself is opened only after authentication.
    const s=session();
    if(!s){location.replace('index.html');return false}
    syncLegacy();
    if(mod&&!can(mod,'View')){
      document.body.innerHTML=`<div class="cmsec-denied"><div class="box"><h1>Access Denied</h1><p>Your role <b>${String(currentRole())}</b> does not have View permission for this module.</p><a href="dashboard.html">Go to ERP Dashboard</a></div></div>`;
      return false;
    }
    return true;
  }

  function init(){
    injectStyle();
    if(!requirePageAccess())return;
    syncLegacy();protectClicks();applySensitive();
    setTimeout(markDom,0);
    const mo=new MutationObserver(()=>markDom());mo.observe(document.body,{subtree:true,childList:true});
  }

  function addUser(obj,password){
    if(currentRole()!=='Admin')throw new Error('Admin permission required.');
    const list=users(),username=String(obj.username||'').trim(),email=String(obj.email||'').trim();
    if(!username)throw new Error('Username is required.');
    if(list.some(x=>x.username.toLowerCase()===username.toLowerCase()||email&&String(x.email||'').toLowerCase()===email.toLowerCase()))throw new Error('Username or email already exists.');
    if(!roles()[obj.role])throw new Error('Invalid role.');
    if(String(password||'').length<6)throw new Error('Password must be at least 6 characters.');
    const u={id:uid(),username,email,name:String(obj.name||username).trim(),role:obj.role,passwordHash:hash(password),active:obj.active!==false,createdAt:now(),mustChangePassword:!!obj.mustChangePassword};
    list.push(u);saveUsers(list);auditSecurity('User Created',username+' / '+u.role);return u;
  }
  function updateUser(id,patch){
    if(currentRole()!=='Admin')throw new Error('Admin permission required.');
    const list=users(),u=list.find(x=>x.id===id);if(!u)throw new Error('User not found.');
    ['name','email','role','active','mustChangePassword'].forEach(k=>{if(patch[k]!==undefined)u[k]=patch[k]});
    saveUsers(list);auditSecurity('User Updated',u.username);return u;
  }
  function resetPassword(id,password){
    if(currentRole()!=='Admin')throw new Error('Admin permission required.');
    if(String(password||'').length<6)throw new Error('Password must be at least 6 characters.');
    const list=users(),u=list.find(x=>x.id===id);if(!u)throw new Error('User not found.');
    u.passwordHash=hash(password);u.mustChangePassword=false;saveUsers(list);auditSecurity('Password Reset',u.username);
  }

  window.CMSEC={
    USERS_KEY,ROLES_KEY,SESSION_KEY,ACTIONS,MODULES,hash,users,roles,saveUsers,saveRoles,
    session,currentUser,currentRole,login,logout,can,denied,pageModule,init,addUser,updateUser,resetPassword,auditSecurity
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();