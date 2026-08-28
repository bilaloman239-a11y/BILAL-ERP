/* Civil Master ERP - Supabase ONLY persistence bridge
   ---------------------------------------------------
   Goal:
   - Business data is NOT persisted in browser localStorage.
   - Existing portal code can keep using localStorage.getItem/setItem internally.
   - For ERP business keys, those calls are redirected to a temporary session cache.
   - The persistent source of truth is Supabase PostgreSQL (erp_portal_state).
   - Any old browser localStorage business data is ignored and removed.
*/
(function(){
  'use strict';

  const cfg = window.CM_SUPABASE_CONFIG || {};

  // Persistent ERP datasets. These are stored in Supabase, not browser localStorage.
  const CLOUD_KEYS = [
    'cm_employee_portal_v3',
    'cm_leave_portal_v1',
    'cm_client_portal_v2',
    'cm_subcontractor_simple_v1',
    'cm_salary_portal_v1'
  ];

  // Compatibility-only local backup key. It is kept only for the current browser tab
  // so old Employee Portal code continues to work. It is never persisted locally/cloud.
  const SESSION_ONLY_KEYS = ['cm_employee_portal_v3_backup'];
  const BUSINESS_KEYS = [...CLOUD_KEYS, ...SESSION_ONLY_KEYS];

  const SHADOW_PREFIX = 'cm_cloud_shadow::';
  const BOOT_KEY = 'cm_supabase_hydrated_v2';
  const CLEAN_KEY = 'cm_supabase_old_local_removed_v1';

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;

  let client = null;
  let hydrating = false;
  const timers = Object.create(null);

  function configured(){
    return cfg.enabled === true && cfg.url && cfg.anonKey &&
      !String(cfg.url).includes('YOUR_') && !String(cfg.anonKey).includes('YOUR_') &&
      window.supabase && typeof window.supabase.createClient === 'function';
  }

  function getClient(){
    if(!client && configured()){
      client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  function shadowKey(key){ return SHADOW_PREFIX + key; }
  function isBusinessKey(key){ return BUSINESS_KEYS.includes(String(key)); }
  function isCloudKey(key){ return CLOUD_KEYS.includes(String(key)); }

  function shadowGet(key){
    return originalGetItem.call(sessionStorage, shadowKey(String(key)));
  }

  function shadowSet(key, value){
    originalSetItem.call(sessionStorage, shadowKey(String(key)), String(value));
  }

  function shadowRemove(key){
    originalRemoveItem.call(sessionStorage, shadowKey(String(key)));
  }

  function removeOldPersistentBusinessData(){
    // Never import old localStorage business records into the new Supabase database.
    BUSINESS_KEYS.forEach(key => {
      try { originalRemoveItem.call(localStorage, key); } catch(_) {}
    });
    try { originalSetItem.call(sessionStorage, CLEAN_KEY, '1'); } catch(_) {}
  }

  function parsePayload(raw){
    if(raw == null) return null;
    try { return JSON.parse(raw); }
    catch { return { _raw: String(raw) }; }
  }

  function serializePayload(payload){
    if(payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, '_raw')){
      return String(payload._raw);
    }
    return JSON.stringify(payload ?? {});
  }

  async function pushKey(key, raw){
    const sb = getClient();
    if(!sb || hydrating || !isCloudKey(key)) return false;

    const { data: authData } = await sb.auth.getSession();
    if(!authData?.session){
      console.warn('[Supabase] Not signed in. Cloud save skipped for', key);
      window.dispatchEvent(new CustomEvent('cm:supabase-auth-required'));
      return false;
    }

    const row = {
      storage_key: String(key),
      payload: parsePayload(raw),
      updated_at: new Date().toISOString()
    };

    const { error } = await sb.from('erp_portal_state').upsert(row, { onConflict: 'storage_key' });
    if(error){
      console.error('[Supabase] save failed for', key, error.message || error);
      window.dispatchEvent(new CustomEvent('cm:supabase-error', { detail: error }));
      return false;
    }

    window.dispatchEvent(new CustomEvent('cm:supabase-saved', { detail: { key } }));
    return true;
  }

  function queuePush(key, raw){
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => pushKey(String(key), String(raw)), 50);
  }

  // Redirect ERP business localStorage calls to a temporary per-tab cache.
  Storage.prototype.getItem = function(key){
    key = String(key);
    if(this === localStorage && isBusinessKey(key)) return shadowGet(key);
    return originalGetItem.call(this, key);
  };

  Storage.prototype.setItem = function(key, value){
    key = String(key);
    if(this === localStorage && isBusinessKey(key)){
      shadowSet(key, value);
      if(isCloudKey(key)) queuePush(key, value);
      return;
    }
    return originalSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function(key){
    key = String(key);
    if(this === localStorage && isBusinessKey(key)){
      shadowRemove(key);
      if(isCloudKey(key) && getClient() && !hydrating){
        getClient().auth.getSession().then(({data})=>{
          if(!data?.session) return;
          return getClient().from('erp_portal_state').delete().eq('storage_key', key);
        }).then(result=>{
          if(result?.error) console.error('[Supabase] delete failed', result.error.message || result.error);
        }).catch(err=>console.error('[Supabase] delete failed', err));
      }
      return;
    }
    return originalRemoveItem.call(this, key);
  };

  Storage.prototype.clear = function(){
    if(this === localStorage){
      // Preserve Supabase auth/session keys and non-ERP preferences; only clear ERP shadow cache.
      BUSINESS_KEYS.forEach(shadowRemove);
      return;
    }
    return originalClear.call(this);
  };

  async function hydrate(){
    const sb = getClient();
    if(!sb) return { enabled: false };

    removeOldPersistentBusinessData();
    hydrating = true;

    try{
      const { data: authData } = await sb.auth.getSession();
      const signedIn = !!authData?.session;

      // Fresh/not-signed-in screen must never fall back to stale browser data.
      CLOUD_KEYS.forEach(shadowRemove);
      SESSION_ONLY_KEYS.forEach(shadowRemove);

      if(!signedIn){
        originalSetItem.call(sessionStorage, BOOT_KEY, '1');
        window.dispatchEvent(new CustomEvent('cm:supabase-ready', { detail: { rows: 0, signedIn: false } }));
        return { enabled: true, rows: 0, signedIn: false };
      }

      const { data, error } = await sb
        .from('erp_portal_state')
        .select('storage_key,payload,updated_at')
        .in('storage_key', CLOUD_KEYS);

      if(error) throw error;

      (data || []).forEach(row => {
        if(row && isCloudKey(row.storage_key)){
          shadowSet(row.storage_key, serializePayload(row.payload));
        }
      });

      originalSetItem.call(sessionStorage, BOOT_KEY, '1');
      window.dispatchEvent(new CustomEvent('cm:supabase-ready', {
        detail: { rows: (data || []).length, signedIn: true }
      }));
      return { enabled: true, rows: (data || []).length, signedIn: true };
    }catch(err){
      console.error('[Supabase] initial load failed', err.message || err);
      window.dispatchEvent(new CustomEvent('cm:supabase-error', { detail: err }));
      return { enabled: true, error: err };
    }finally{
      hydrating = false;
    }
  }

  async function forceSync(){
    const sb = getClient();
    if(!sb) return false;
    const { data: authData } = await sb.auth.getSession();
    if(!authData?.session) return false;

    for(const key of CLOUD_KEYS){
      const raw = shadowGet(key);
      if(raw != null) await pushKey(key, raw);
    }
    return true;
  }

  async function clearCloudBusinessData(){
    const sb = getClient();
    if(!sb) return false;
    const { data: authData } = await sb.auth.getSession();
    if(!authData?.session) return false;

    const { error } = await sb.from('erp_portal_state').delete().in('storage_key', CLOUD_KEYS);
    if(error) throw error;
    BUSINESS_KEYS.forEach(shadowRemove);
    return true;
  }

  window.CMSupabase = {
    keys: CLOUD_KEYS.slice(),
    configured,
    getClient,
    hydrate,
    forceSync,
    clearCloudBusinessData,
    mode: 'supabase-only'
  };

  // Remove old browser-persisted ERP records immediately, before page scripts read them.
  removeOldPersistentBusinessData();

  // Hydrate from Supabase once per tab/session, then reload once so the existing
  // synchronous portal code starts with a cloud-backed snapshot.
  if(configured() && originalGetItem.call(sessionStorage, BOOT_KEY) !== '1'){
    document.documentElement.style.visibility = 'hidden';
    hydrate().finally(() => {
      document.documentElement.style.visibility = 'visible';
      if(originalGetItem.call(sessionStorage, BOOT_KEY) === '1') location.reload();
    });
  }
})();
