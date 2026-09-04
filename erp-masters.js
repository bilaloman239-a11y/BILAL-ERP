/* ===================================================================
   Civil Master ERP — CENTRAL SETTINGS / MASTERS ENGINE
   One source of truth for shared lists used across ERP modules.
   =================================================================== */
(function(){
  if(window.CMMASTER) return;

  const KEY='cm_erp_masters_v1';
  const DEFAULTS={
    company:['Civil Master General Maintenance LLC - OPC'],
    branch:['Abu Dhabi'],
    emirate:['Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah'],
    designation:['Accountant','Administrator','Driver','Electrician','Engineer','Foreman','Helper','HR Officer','Manager','Mechanic','Pipe Fitter','Rigger','Safety Officer','Supervisor','Welder'],
    craft:['Electrician','Fitter','Helper','Instrument Technician','Mechanic','Pipe Fitter','Rigger','Scaffolder','Welder'],
    nationality:['Bangladeshi','Egyptian','Emirati','Filipino','Indian','Nepalese','Pakistani','Sri Lankan'],
    leaveType:['Annual Leave','Medical Leave','Unpaid Leave','Emergency Leave'],
    attendanceCode:['P','A','M','L','OFF','H','JOIN'],
    documentType:['Passport','Visa','Emirates ID','Labour Card / Work Permit','Labour Contract','Insurance','Driving Licence','Medical Card'],
    certificateType:['ADNOC Medical','H2S','First Aid','Scaffolding','Rigging','Safety Training'],
    projectStatus:['Planned','Active','On Hold','Completed','Cancelled'],
    employeeStatus:['Active','Inactive','On Leave','Mobilized','Demobilized'],
    paymentMode:['Bank Transfer','Cash','Cheque','WPS'],
    mobilizationStatus:['Available','Mobilized','Transferred','On Leave','Returned','Demobilized','Inactive']
  };

  const LABELS={
    company:'Company',branch:'Branch',emirate:'Emirate',designation:'Designation',craft:'Craft',
    nationality:'Nationality',leaveType:'Leave Type',attendanceCode:'Attendance Code',
    documentType:'Document Type',certificateType:'Certificate Type',projectStatus:'Project Status',
    employeeStatus:'Employee Status',paymentMode:'Payment Mode',mobilizationStatus:'Mobilization Status'
  };

  function getRaw(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}}
  function saveRaw(v){localStorage.setItem(KEY,JSON.stringify(v))}
  function norm(v){return String(v??'').trim()}
  function keyNorm(v){return norm(v).toLowerCase()}
  function seed(){
    let d=getRaw();
    if(!d||typeof d!=='object') d={};
    Object.keys(DEFAULTS).forEach(k=>{
      const existing=Array.isArray(d[k])?d[k]:[];
      const merged=[];
      [...existing,...DEFAULTS[k]].forEach(x=>{
        x=norm(x); if(x&&!merged.some(y=>keyNorm(y)===keyNorm(x)))merged.push(x)
      });
      d[k]=merged;
    });
    saveRaw(d); return d;
  }
  seed();

  function all(){return seed()}
  function list(type){return [...(all()[type]||[])]}
  function setList(type,arr){
    const d=all(); d[type]=[];
    (arr||[]).forEach(x=>{x=norm(x);if(x&&!d[type].some(y=>keyNorm(y)===keyNorm(x)))d[type].push(x)});
    saveRaw(d); return d[type];
  }
  function add(type,value){
    value=norm(value); if(!value)throw new Error('Value is required.');
    const d=all(),a=d[type]||[];
    if(a.some(x=>keyNorm(x)===keyNorm(value)))throw new Error('Duplicate master value.');
    a.push(value);d[type]=a;saveRaw(d);return value;
  }
  function rename(type,oldValue,newValue){
    newValue=norm(newValue); if(!newValue)throw new Error('New value is required.');
    const d=all(),a=d[type]||[],ix=a.findIndex(x=>keyNorm(x)===keyNorm(oldValue));
    if(ix<0)throw new Error('Master value not found.');
    if(a.some((x,i)=>i!==ix&&keyNorm(x)===keyNorm(newValue)))throw new Error('Duplicate master value.');
    a[ix]=newValue;d[type]=a;saveRaw(d);return newValue;
  }
  function remove(type,value){
    const d=all(),a=d[type]||[];
    d[type]=a.filter(x=>keyNorm(x)!==keyNorm(value));saveRaw(d);return d[type];
  }
  function reset(type){
    const d=all();d[type]=[...(DEFAULTS[type]||[])];saveRaw(d);return d[type];
  }
  function options(type,selected,blankLabel){
    const arr=list(type);let h=blankLabel!==undefined?`<option value="">${blankLabel}</option>`:'';
    h+=arr.map(x=>`<option ${String(selected??'')===x?'selected':''}>${String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}</option>`).join('');
    return h;
  }
  function bindSelect(elOrId,type,opts){
    const el=typeof elOrId==='string'?document.getElementById(elOrId):elOrId;if(!el)return;
    const cur=el.value; const blank=(opts&&'blankLabel'in opts)?opts.blankLabel:(el.querySelector('option[value=""]')?.textContent||null);
    el.innerHTML=options(type,cur,blank===null?undefined:blank);
    if(cur&&list(type).includes(cur))el.value=cur;
  }
  window.CMMASTER={KEY,DEFAULTS,LABELS,all,list,setList,add,rename,remove,reset,options,bindSelect};
})();