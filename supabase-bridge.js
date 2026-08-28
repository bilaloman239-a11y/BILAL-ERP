/* Civil Master ERP - Supabase persistence bridge
   Keeps the existing portal code working while moving persistent portal data
   from browser-only localStorage to Supabase PostgreSQL.
*/
(function(){
  'use strict';
  const cfg = window.CM_SUPABASE_CONFIG || {};
  const KEYS = [
    'cm_employee_portal_v3',
    'cm_employee_portal_v3_backup',
    'cm_leave_portal_v1',
    'cm_client_portal_v2',
    'cm_subcontractor_simple_v1',
    'cm_salary_portal_v1'
  ];
  const BOOT_KEY = 'cm_supabase_hydrated_v1';
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  let client = null;
  let hydrating = false;
  let timers = {};

  function configured(){
    return cfg.enabled === true && cfg.url && cfg.anonKey &&
      !String(cfg.url).includes('YOUR_') && !String(cfg.anonKey).includes('YOUR_') &&
      window.supabase && typeof window.supabase.createClient === 'function';
  }

  function getClient(){
    if(!client && configured()) client = window.supabase.createClient(cfg.url, cfg.anonKey);
    return client;
  }

  function parsePayload(raw){
    if(raw == null) return null;
    try { return JSON.parse(raw); }
    catch { return { _raw: String(raw) }; }
  }

  async function pushKey(key, raw){
    const sb = getClient();
    if(!sb || hydrating || !KEYS.includes(key)) return;
    const payload = parsePayload(raw);
    const row = {
      storage_key: key,
      payload,
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from('erp_portal_state').upsert(row, { onConflict: 'storage_key' });
    if(error) console.error('[Supabase] save failed for', key, error.message || error);
  }

  function queuePush(key, raw){
    clearTimeout(timers[key]);
    timers[key] = setTimeout(()=>pushKey(key, raw), 250);
  }

  Storage.prototype.setItem = function(key, value){
    originalSetItem.call(this, key, value);
    if(this === localStorage && KEYS.includes(String(key))) queuePush(String(key), String(value));
  };

  Storage.prototype.removeItem = function(key){
    originalRemoveItem.call(this, key);
    if(this === localStorage && KEYS.includes(String(key)) && getClient() && !hydrating){
      getClient().from('erp_portal_state').delete().eq('storage_key', String(key))
        .then(({error})=>{ if(error) console.error('[Supabase] delete failed', error.message || error); });
    }
  };

  async function hydrate(){
    const sb = getClient();
    if(!sb) return {enabled:false};
    hydrating = true;
    try{
      const { data, error } = await sb.from('erp_portal_state').select('storage_key,payload,updated_at').in('storage_key', KEYS);
      if(error) throw error;
      (data || []).forEach(row=>{
        if(row && KEYS.includes(row.storage_key)){
          const raw = row.payload && typeof row.payload === 'object' && Object.prototype.hasOwnProperty.call(row.payload,'_raw')
            ? String(row.payload._raw) : JSON.stringify(row.payload ?? {});
          originalSetItem.call(localStorage, row.storage_key, raw);
        }
      });
      sessionStorage.setItem(BOOT_KEY, '1');
      window.dispatchEvent(new CustomEvent('cm:supabase-ready'));
      return {enabled:true, rows:(data||[]).length};
    }catch(err){
      console.error('[Supabase] initial load failed', err.message || err);
      window.dispatchEvent(new CustomEvent('cm:supabase-error', {detail:err}));
      return {enabled:true, error:err};
    }finally{
      hydrating = false;
    }
  }

  window.CMSupabase = {
    keys: KEYS.slice(),
    configured,
    getClient,
    hydrate,
    async forceSync(){
      const sb=getClient(); if(!sb) return false;
      for(const key of KEYS){ const raw=localStorage.getItem(key); if(raw!=null) await pushKey(key,raw); }
      return true;
    }
  };

  // First page visit: hydrate cloud data, then reload once so existing synchronous
  // portal code reads the Supabase-backed snapshot without a large UI rewrite.
  if(configured() && sessionStorage.getItem(BOOT_KEY)!=='1'){
    document.documentElement.style.visibility='hidden';
    hydrate().finally(()=>{
      document.documentElement.style.visibility='visible';
      if(sessionStorage.getItem(BOOT_KEY)==='1') location.reload();
    });
  }
})();
