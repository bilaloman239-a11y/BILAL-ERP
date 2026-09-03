/* ===================================================================
   Civil Master ERP — Central Validation & Controls Engine
   One shared engine used by every module (Employee, Client, Project,
   Subcontractor, Timesheet, Payroll, Leave, CICPA, Site/Mobilization,
   Master Data). Admin decides Block / Warning / Allow with Approval
   for each rule from the Validation & Controls Master page
   (validation.html) — every module reads the SAME config.
   =================================================================== */
(function(){
  if(window.CMV) return; // already loaded on this page
  const CONFIG_KEY = 'cm_validation_controls_v1';
  const APPROVAL_QUEUE_KEY = 'cm_validation_approval_queue_v1';

  /* ---------- Rule catalogue (also drives the admin UI) ---------- */
  const RULES = [
    // Employee
    {key:'employee.code.required',      module:'Employee',      label:'Employee Code — required',                          def:'Block'},
    {key:'employee.code.unique',        module:'Employee',      label:'Employee Code — UNIQUE',                            def:'Block'},
    {key:'employee.code.nospace',       module:'Employee',      label:'Employee Code — no internal spaces',                def:'Block'},
    {key:'employee.unifiedNumber.unique',module:'Employee',     label:'Unified Number — UNIQUE when entered',              def:'Block'},
    {key:'employee.eid.unique',         module:'Employee',      label:'Emirates ID — UNIQUE',                              def:'Block'},
    {key:'employee.eid.format',         module:'Employee',      label:'Emirates ID — format check (784-YYYY-XXXXXXX-X)',  def:'Warning'},
    {key:'employee.passport.unique',    module:'Employee',      label:'Passport Number — UNIQUE',                          def:'Block'},
    {key:'employee.labourCard.unique',  module:'Employee',      label:'Labour Card / Work Permit No. — prefer UNIQUE',    def:'Warning'},
    {key:'employee.visaNumber.unique',  module:'Employee',      label:'UAE Visa Number — prefer UNIQUE',                   def:'Warning'},
    {key:'employee.joiningDate.afterDob',module:'Employee',     label:'Joining Date must be after Date of Birth',          def:'Warning'},
    {key:'employee.inactive.newRecord', module:'Employee',      label:'Inactive employee — warn on new Leave/Timesheet/Payroll',def:'Warning'},
    {key:'employee.expiredDoc.process', module:'Employee',      label:'Expired document — warn on Mobilization / CICPA processing',def:'Warning'},
    // Client
    {key:'client.code.unique',          module:'Client',        label:'Client Code — UNIQUE',                              def:'Block'},
    {key:'client.trn.unique',           module:'Client',        label:'TRN — UNIQUE',                                      def:'Block'},
    {key:'client.trn.format',           module:'Client',        label:'TRN — must be 15 digits',                           def:'Warning'},
    {key:'client.tradeLicense.unique',  module:'Client',        label:'Trade License No. — Warn/UNIQUE (branch dependent)',def:'Block'},
    // Project
    {key:'project.ref.unique',          module:'Project',       label:'Project Ref No. — UNIQUE',                          def:'Block'},
    {key:'project.code.unique',         module:'Project',       label:'Project Code / Job No. — UNIQUE',                   def:'Block'},
    {key:'project.dateRange',           module:'Project',       label:'Project End Date must not be before Start Date',    def:'Block'},
    {key:'project.duplicateName',       module:'Project',       label:'Client + Project Name — duplicate warning',         def:'Warning'},
    // Subcontractor
    {key:'subcontractor.code.unique',   module:'Subcontractor', label:'Supplier / Subcontractor Code — UNIQUE',            def:'Block'},
    {key:'subcontractor.trn.unique',    module:'Subcontractor', label:'TRN — UNIQUE',                                      def:'Block'},
    {key:'subcontractor.trn.format',    module:'Subcontractor', label:'TRN — must be 15 digits',                           def:'Warning'},
    {key:'subcontractor.tradeLicense.unique',module:'Subcontractor',label:'Trade License No. — UNIQUE',                    def:'Block'},
    // Timesheet
    {key:'timesheet.composite.unique',  module:'Timesheet',     label:'Employee + Month/Date + Type — composite UNIQUE',  def:'Block'},
    {key:'timesheet.hours.range',       module:'Timesheet',     label:'Timesheet hours — must not be negative / over max',def:'Block'},
    // Payroll
    {key:'payroll.composite.unique',    module:'Payroll',       label:'Employee + Payroll Month/Year — composite UNIQUE',  def:'Block'},
    {key:'payroll.rates.negative',      module:'Payroll',       label:'Salary / rates — must not be negative',             def:'Block'},
    // Leave
    {key:'leave.overlap',               module:'Leave',         label:'Same employee — overlapping leave dates',           def:'Block'},
    {key:'leave.ref.unique',            module:'Leave',         label:'Leave application / reference no. — UNIQUE',        def:'Block'},
    {key:'leave.dateRange',             module:'Leave',         label:'Leave End Date must not be before Start Date',      def:'Block'},
    {key:'leave.paidVsTotal',           module:'Leave',         label:'Paid Leave Days must not exceed Total Leave Days',  def:'Block'},
    // CICPA
    {key:'cicpa.cicpaNo.unique',        module:'CICPA',         label:'CICPA No. — UNIQUE',                                def:'Block'},
    {key:'cicpa.ref.composite',         module:'CICPA',         label:'Employee + CICPA application/ref no. — composite UNIQUE (if applicable)',def:'Block'},
    {key:'cicpa.dateRange',             module:'CICPA',         label:'CICPA Expiry Date must not be before Issue Date',   def:'Block'},
    // Site / Mobilization
    {key:'site.assignment.duplicate',   module:'Site',          label:'Employee + Site + From Date — duplicate protection',def:'Warning'},
    {key:'mobilization.duplicate',      module:'Site',          label:'Employee + Project + Mobilization Date — duplicate protection',def:'Block'},
    // Master Data
    {key:'master.designation.duplicate',module:'Master Data',   label:'Designation name — case-insensitive duplicate prevention',def:'Block'},
    {key:'master.nationality.duplicate',module:'Master Data',   label:'Nationality — case-insensitive duplicate prevention',def:'Block'},
    {key:'master.documentType.duplicate',module:'Master Data',  label:'Document Type — case-insensitive duplicate prevention',def:'Block'},
    // Users / Login
    {key:'user.username.unique',        module:'Users',         label:'Username — UNIQUE',                                 def:'Block'},
    {key:'user.email.unique',           module:'Users',         label:'Email — UNIQUE',                                    def:'Block'}
  ];

  function defaultControls(){
    const c={}; RULES.forEach(r=>c[r.key]=r.def); return c;
  }

  function getControls(){
    try{
      const stored=JSON.parse(localStorage.getItem(CONFIG_KEY))||{};
      return {...defaultControls(), ...stored};
    }catch(e){ return defaultControls(); }
  }

  function setControl(key,mode){
    const c=getControls(); c[key]=mode;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  }

  function resetControls(){
    localStorage.setItem(CONFIG_KEY, JSON.stringify(defaultControls()));
  }

  function queueApproval(ruleKey,message,context){
    let q=[]; try{ q=JSON.parse(localStorage.getItem(APPROVAL_QUEUE_KEY))||[]; }catch(e){}
    q.unshift({id:'VA-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),ruleKey,message,context:context||'',at:new Date().toISOString(),status:'Pending'});
    if(q.length>500) q=q.slice(0,500);
    localStorage.setItem(APPROVAL_QUEUE_KEY, JSON.stringify(q));
  }

  /* ---------------- normalizers ---------------- */
  function normText(v){ return String(v??'').trim(); }
  function normUpper(v){ return normText(v).toUpperCase(); }
  function normAlnum(v){ return normUpper(v).replace(/[^A-Z0-9]/g,''); }      // for unique-number matching (strips spaces/hyphens)
  function normCodeNoSpace(v){ return normText(v).replace(/\s+/g,''); }       // preserves case, strips ALL spaces
  function hasInternalSpace(v){ const t=normText(v); return /\s/.test(t); }

  /* ---------------- format validators ---------------- */
  function isValidEID(v){
    // Accepts 784-YYYY-XXXXXXX-X with or without dashes/spaces
    const digits=normAlnum(v);
    if(!/^784\d{12}$/.test(digits)) return false;
    return true;
  }
  function isValidTRN(v){
    const digits=String(v||'').replace(/\D/g,'');
    return digits.length===15;
  }

  /* ---------------- date helpers ---------------- */
  function dateOk(a,b){ // returns true if b is on/after a (b>=a); ignores empty
    if(!a||!b) return true;
    return String(b) >= String(a);
  }

  /* ---------------- generic storage helpers ---------------- */
  function erpGet(key,def){
    try{ const v=JSON.parse(localStorage.getItem(key)); return v??def; }catch(e){ return def; }
  }

  /* ---------------- the enforcement gate ----------------
     violated = true  -> a problem was found
     Returns {proceed:boolean, flagged:boolean}
     Block   -> alert + stop
     Warning -> confirm() to let the user proceed or cancel
     Allow with Approval -> proceeds, but logged to the approval queue
  --------------------------------------------------------- */
  function enforce(ruleKey, violated, message, context){
    if(!violated) return {proceed:true, flagged:false};
    const mode=getControls()[ruleKey] || 'Block';
    if(mode==='Block'){
      alert('⛔ '+message);
      return {proceed:false, flagged:false};
    }
    if(mode==='Warning'){
      const ok=confirm('⚠️ '+message+'\n\nDo you want to continue anyway?');
      return {proceed:ok, flagged:false};
    }
    // Allow with Approval
    queueApproval(ruleKey,message,context);
    return {proceed:true, flagged:true};
  }

  window.CMV = {
    RULES, CONFIG_KEY, APPROVAL_QUEUE_KEY,
    defaultControls, getControls, setControl, resetControls, queueApproval,
    normText, normUpper, normAlnum, normCodeNoSpace, hasInternalSpace,
    isValidEID, isValidTRN, dateOk, erpGet, enforce
  };
})();
