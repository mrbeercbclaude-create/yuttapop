// Saves: localStorage always, Supabase table `saves` (one row per user) when logged in.
G.save = (() => {
  const KEY = G.CFG.SAVE_KEY;
  let sb = null, user = null, lastCloudT = 0, busy = false, status = "local", listeners = [];
  const set = s => { status = s; listeners.forEach(f => f(s)); };

  function client() {
    if (!sb && window.supabase && window.supabase.createClient)
      sb = window.supabase.createClient(G.CFG.SUPABASE_URL, G.CFG.SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true } });
    return sb;
  }
  function loadLocal() { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function saveLocal(S) { S.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function guest(on) { try { on ? localStorage.setItem(KEY + "-guest", "1") : localStorage.removeItem(KEY + "-guest"); } catch (e) {} }
  function isGuest() { try { return localStorage.getItem(KEY + "-guest") === "1"; } catch (e) { return false; } }

  async function session() {
    const c = client(); if (!c) return null;
    try { const { data } = await c.auth.getSession(); user = data.session ? data.session.user : null; } catch (e) { user = null; }
    return user;
  }
  async function signIn(email, pw) {
    const { data, error } = await client().auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
    user = data.user; guest(false); return user;
  }
  async function signUp(email, pw) {
    const { data, error } = await client().auth.signUp({ email, password: pw });
    if (error) throw error;
    if (data.session) { user = data.user; guest(false); }
    return { needsConfirm: !data.session };
  }
  async function signOut() { try { await client().auth.signOut(); } catch (e) {} user = null; set("local"); }

  async function fetchCloud() {
    const { data, error } = await client().from("saves").select("data").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  }
  // Picks the newer of local and cloud. A local save from another account is ignored.
  async function reconcile() {
    let local = loadLocal();
    if (local && local.owner && user && local.owner !== user.id) local = null;
    if (!user) return { S: local, from: "local" };
    set("syncing");
    try {
      const cloud = await fetchCloud();
      if (cloud && (!local || (cloud.t || 0) >= (local.t || 0))) { lastCloudT = cloud.t || 0; set("synced"); return { S: cloud, from: "cloud" }; }
      set("synced");
      return { S: local, from: local ? "local" : "new", pushNeeded: true };
    } catch (e) { set("offline"); return { S: local, from: "local", error: e }; }
  }
  // Refuses to overwrite a cloud save written by another device since our last sync.
  async function push(S, force) {
    saveLocal(S);
    if (!user || busy) return { ok: false };
    busy = true; set("syncing");
    try {
      S.owner = user.id;
      if (!force) {
        const { data, error } = await client().from("saves").select("t:data->>t").eq("user_id", user.id).maybeSingle();
        if (error) throw error;
        const cloudT = data && data.t ? Number(data.t) : 0;
        if (cloudT > lastCloudT + 500) { set("conflict"); return { ok: false, conflict: true, cloudT }; }
      }
      S.t = Date.now();
      const { error } = await client().from("saves").upsert({ user_id: user.id, data: S, updated_at: new Date().toISOString() });
      if (error) throw error;
      lastCloudT = S.t; saveLocal(S); set("synced");
      return { ok: true };
    } catch (e) { set(navigator.onLine === false ? "offline" : "error"); return { ok: false, error: e }; }
    finally { busy = false; }
  }
  async function pullCloud() { const c = await fetchCloud(); if (c) lastCloudT = c.t || 0; set("synced"); return c; }

  return {
    client, loadLocal, saveLocal, session, signIn, signUp, signOut, reconcile, push, pullCloud, guest, isGuest,
    get user() { return user; }, get status() { return status; }, onStatus: f => listeners.push(f)
  };
})();
