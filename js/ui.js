// Screens, panels, input, game loop and boot.
(() => {
  const g = G.game, sv = G.save, $ = id => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");
  let tab = "char", started = false;

  const fmt = n => { n = Math.floor(n); return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : String(n); };
  const pct = x => Math.round(x * 100) + "%";
  // Art that 404s once is remembered, so per-second re-renders don't re-request it.
  const missing = new Set();
  G.miss = img => { missing.add(img.getAttribute("src")); img.remove(); };
  const img = src => missing.has(src) ? "" : `<img src="${src}" alt="" onerror="G.miss(this)">`;
  const ic = (key, label) => `<span class="ic"><b>${label || "?"}</b>${img("assets/icon/" + key + ".png")}</span>`;
  const log = m => { $("log").textContent = m; };
  g.setLog(log);

  // ---------- login ----------
  function showLogin(msg) { $("app").hidden = true; $("login").hidden = false; $("loginMsg").textContent = msg || ""; }
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const em = $("email").value.trim(), pw = $("pw").value;
    $("loginMsg").textContent = "กำลังเข้าสู่ระบบ…";
    try { await sv.signIn(em, pw); await startFromCloud(); }
    catch (err) { $("loginMsg").textContent = thaiErr(err); }
  });
  $("btnSignUp").addEventListener("click", async () => {
    const em = $("email").value.trim(), pw = $("pw").value;
    if (!em || pw.length < 6) { $("loginMsg").textContent = "ใส่อีเมล และรหัสผ่านอย่างน้อย 6 ตัวก่อน"; return; }
    $("loginMsg").textContent = "กำลังสมัคร…";
    try {
      const r = await sv.signUp(em, pw);
      if (r.needsConfirm) $("loginMsg").textContent = "สมัครแล้ว เปิดอีเมลแล้วกดลิงก์ยืนยัน จากนั้นกลับมากดเข้าสู่ระบบ";
      else await startFromCloud();
    } catch (err) { $("loginMsg").textContent = thaiErr(err); }
  });
  $("btnGuest").addEventListener("click", () => { sv.guest(true); start(sv.loadLocal(), "local"); });
  function thaiErr(e) {
    const m = (e && e.message || "").toLowerCase();
    if (m.includes("invalid login")) return "อีเมลหรือรหัสผ่านไม่ถูก";
    if (m.includes("not confirmed")) return "ยังไม่ได้ยืนยันอีเมล เปิดอีเมลแล้วกดลิงก์ก่อน";
    if (m.includes("already registered")) return "อีเมลนี้สมัครไว้แล้ว กดเข้าสู่ระบบแทน";
    if (m.includes("fetch") || m.includes("network")) return "ต่อเน็ตไม่ได้ ลองใหม่อีกครั้ง";
    return "ไม่สำเร็จ: " + (e && e.message || "ไม่ทราบสาเหตุ");
  }
  async function startFromCloud() {
    const r = await sv.reconcile();
    start(r.S, r.from);
    if (r.pushNeeded) sv.push(g.S, true);
  }

  // ---------- start ----------
  function start(S, from) {
    if (!S) from = "new";
    g.S = S || g.fresh();
    const away = S ? (Date.now() - (S.t || Date.now())) / 1000 : 0;
    $("login").hidden = true; $("app").hidden = false;
    g.enterMap(g.unlocked(g.S.map) ? g.S.map : 0);
    if (away > 60) showOffline(g.offline(away));
    log(from === "cloud" ? "โหลดเซฟจากคลาวด์แล้ว" : from === "new" ? "เริ่มต้นการเดินทางในยุทธภพ" : "โหลดเซฟในเครื่องแล้ว");
    renderAll();
    if (!started) { started = true; fit(); requestAnimationFrame(frame); setInterval(slowTick, 250); }
    G.art.preload(["hero/hero_idle", "hero/hero_walk", "hero/hero_attack1", "hero/hero_attack2", "hero/hero_skill", "hero/hero_palm", "hero/hero_hurt", "hero/hero_down", "hero/hero_meditate", "hero/hero_breakthrough", "bg/r1_far", "bg/r1_mid", "bg/r1_ground", "bg/cave_meditation"]);
  }

  // ---------- loop ----------
  let lastT = performance.now(), hudT = 0, localT = 0, cloudT = 0, panelT = 0;
  function step() {
    const now = performance.now();
    let dt = Math.min(5, (now - lastT) / 1000); lastT = now;
    while (dt > 0) { const d = Math.min(0.05, dt); g.tick(d); dt -= d; hudT += d; localT += d; cloudT += d; panelT += d; }
    if (g.S.pendingEvent && $("modal").hidden) showCave();
    if (hudT > 0.2) { hudT = 0; renderHud(); }
    if (panelT > 1) { panelT = 0; const a = document.activeElement; if (!a || !$("panel").contains(a) || !/^(SELECT|INPUT)$/.test(a.tagName)) renderPanel(); }
    if (localT > 5) { localT = 0; sv.saveLocal(g.S); }
    if (cloudT > 30) { cloudT = 0; cloudPush(); }
  }
  function frame() { step(); g.draw(ctx); requestAnimationFrame(frame); }
  function slowTick() { if (performance.now() - lastT > 200) step(); }
  function fit() { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = 640 * d; cv.height = 360 * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener("resize", fit);
  document.addEventListener("visibilitychange", () => { if (document.hidden && started) { sv.saveLocal(g.S); cloudPush(); } });
  async function cloudPush(force) {
    if (!sv.user) return;
    const r = await sv.push(g.S, force);
    if (r.conflict) $("conflict").hidden = false;
  }
  sv.onStatus(s => { const el = $("sync"); el.className = "sync " + s; el.title = { local: "เซฟในเครื่อง", synced: "ซิงก์แล้ว", syncing: "กำลังซิงก์", conflict: "เซฟชนกัน", error: "ซิงก์ไม่สำเร็จ", offline: "ออฟไลน์" }[s] || s; });

  cv.addEventListener("click", e => {
    if (g.S.mode !== "fight") return;
    const r = cv.getBoundingClientRect();
    g.tapWorld((e.clientX - r.left) * 640 / r.width);
  });

  // ---------- render ----------
  function renderHud() {
    const S = g.S, s = g.st(), p = g.R.p, rl = G.REALMS[S.realm];
    $("heroName").textContent = S.name; $("realmName").textContent = rl.n; $("heroLv").textContent = S.lv + (S.lv >= rl.cap ? " (เพดาน)" : "");
    if ($("realmBadge").dataset.k !== rl.badge) { $("realmBadge").dataset.k = rl.badge; $("realmBadge").innerHTML = img("assets/icon/" + rl.badge + ".png"); }
    $("taels").textContent = fmt(S.taels); $("qi").textContent = fmt(S.qi);
    $("hpBar").style.width = pct(Math.max(0, p.hp) / s.maxHp); $("hpTxt").textContent = Math.ceil(Math.max(0, p.hp)) + "/" + s.maxHp + (g.injured() ? " · บาดเจ็บ" : "");
    const req = g.expReq(S.lv); $("expBar").style.width = pct(Math.min(1, S.exp / req)); $("expTxt").textContent = fmt(S.exp) + "/" + fmt(req);
    renderModes();
  }
  function renderModes() {
    const S = g.S, r = g.rates(S.map);
    const html = [
      ["fight", "ต่อสู้", fmt(r.exp * 3600) + " EXP/ชม."],
      ["meditate", "ปิดด่าน", fmt(g.qiRate() * 3600) + " ปราณ/ชม."],
      ["study", "ศึกษา", G.TECH[S.studyTech].n]
    ].map(([m, n, d]) => `<button data-act="mode" data-v="${m}" class="${S.mode === m ? "on" : ""}">${n}<small>${d}</small></button>`).join("");
    if ($("modes").innerHTML !== html) $("modes").innerHTML = html;
  }
  function tierBar(id) {
    const S = g.S, t = g.tier(id), cur = G.TIERS[t][1], nx = G.TIERS[t + 1];
    if (!nx) return `<span class="sub">สมบูรณ์แบบ</span>`;
    const f = (S.techs[id] - cur) / (nx[1] - cur);
    return `<div class="meter"><i class="m" style="width:${pct(Math.min(1, f))}"></i></div><span class="sub">${G.TIERS[t][0]} · ${fmt(S.techs[id])}/${fmt(nx[1])}</span>`;
  }

  function panelChar() {
    const S = g.S, s = g.st(), b = g.breakReq();
    const statRow = (k, n, hint) => `<div class="row"><span><span class="k">${n}</span> <b>${S[k]}</b> <span class="sub">${hint}</span></span><button data-act="stat" data-v="${k}" ${S.pts ? "" : "disabled"} aria-label="เพิ่ม${n}">+</button></div>`;
    let brk = `<div class="sub">ถึงขั้นสูงสุดของเดโมนี้แล้ว</div>`;
    if (b) brk = b.items.map(i => `<div class="row"><span>${i.txt}</span><b class="${i.ok ? "ok" : "no"}">${i.ok ? "ผ่าน" : "ยัง"}</b></div>`).join("") +
      `<div class="row"><span class="k">โอกาสสำเร็จ</span><b>${pct(b.chance)}</b></div>` +
      (S.insight ? `<div class="sub">ความเข้าใจจากความล้มเหลว ${S.insight} ครั้ง (+${S.insight * 5}%)</div>` : "") +
      `<button data-act="break" class="${b.ready ? "primary" : ""}" ${b.ready ? "" : "disabled"}>ทะลวงขั้นสู่ ${b.next.n}</button>`;
    return `<div class="card"><h2>ขอบเขตพลัง</h2><div class="row"><span class="realm">${G.REALMS[S.realm].n}</span><span class="sub">เพดานเลเวล ${G.REALMS[S.realm].cap}</span></div>${brk}</div>
    <div class="card"><h2>พลังยุทธ์</h2><div class="sub">แต้มคงเหลือ ${S.pts} (ได้ 3 แต้มต่อเลเวล)</div>
      ${statRow("str", "พลังกาย", "ดาเมจ · เลือด")}${statRow("agi", "ความว่องไว", "ความเร็ว · คริ")}${statRow("comp", "ความเข้าใจ", "ฝึกวิชาไว · ทะลวงขั้น")}${statRow("luk", "วาสนา", "ตำลึง · ดรอป · ถ้ำลับ")}
      <div class="grid2">
        <div class="row"><span class="k">ดาเมจ</span><span>${fmt(s.maxDmg * s.mastery)}–${fmt(s.maxDmg)}</span></div>
        <div class="row"><span class="k">ความแม่นกระบวนท่า</span><span>${pct(s.mastery)}</span></div>
        <div class="row"><span class="k">โจมตีทุก</span><span>${s.interval.toFixed(2)} วิ</span></div>
        <div class="row"><span class="k">คริ</span><span>${pct(s.crit)} ×${s.critDmg.toFixed(2)}</span></div>
        <div class="row"><span class="k">พลังชีวิต</span><span>${s.maxHp}</span></div>
        <div class="row"><span class="k">ป้องกัน</span><span>${s.def}</span></div>
      </div>
      ${g.injured() ? `<div class="row"><span class="no">บาดเจ็บภายใน (ดาเมจ −30%)</span><button data-act="usePill" data-v="heal" ${S.pills.heal ? "" : "disabled"}>กินยารักษา (${S.pills.heal || 0})</button></div>` : ""}
    </div>`;
  }
  function panelTech() {
    const S = g.S;
    const learned = Object.keys(G.TECH).filter(id => id in S.techs);
    const actives = S.order.filter(id => id in S.techs);
    const list = learned.map(id => {
      const t = G.TECH[id];
      const extra = t.kind === "active" ? `แรง ×${g.techMult(id).toFixed(2)} · คูลดาวน์ ${g.techCd(id).toFixed(1)} วิ` : t.kind === "guard" ? `คูลดาวน์ ${g.techCd(id).toFixed(1)} วิ` : t.desc;
      return `<div class="item">${ic(t.icon, t.n[0])}<div class="t"><b>${t.n}</b><span class="sub">${G.KIND_NAME[t.kind]} · ${extra}</span>${tierBar(id)}</div><span></span></div>`;
    }).join("");
    const order = actives.map((id, i) => `<div class="row"><span>${i + 1}. ${G.TECH[id].n}</span><span class="btns"><button data-act="up" data-v="${id}" ${i ? "" : "disabled"} aria-label="เลื่อนขึ้น">↑</button><button data-act="down" data-v="${id}" ${i < actives.length - 1 ? "" : "disabled"} aria-label="เลื่อนลง">↓</button></span></div>`).join("") || `<div class="sub">ยังไม่มีท่าโจมตี ซื้อคัมภีร์ที่ร้าน</div>`;
    const studyOpts = learned.map(id => `<option value="${id}" ${S.studyTech === id ? "selected" : ""}>${G.TECH[id].n}</option>`).join("");
    const manual = S.manuals.palm ? `<div class="card"><h2>คัมภีร์ฝ่ามือฉีกขาด</h2><div class="sub">ต้องมีความเข้าใจ 25 ถึงจะอ่านหน้าที่หายไปออก (ตอนนี้ ${S.comp})</div><button data-act="read">ลองอ่าน</button></div>` : "";
    const missing = Object.keys(G.TECH).filter(id => !(id in S.techs)).map(id => {
      const how = id === "star" || id === "bell" ? "ซื้อที่หอคัมภีร์" : id === "palm" ? "หัวหน้าโจรภูเขาดรอปคัมภีร์ฉีกขาด" : "แกนปราณวิเคราะห์บอสครบ 100%";
      return `<div class="item dim">${ic(G.TECH[id].icon, "?")}<div class="t"><b>${G.TECH[id].n}</b><span class="sub">${how}</span></div><span></span></div>`;
    }).join("");
    return `<div class="card"><h2>วิชาที่รู้</h2>${list}</div>
    <div class="card"><h2>ลำดับการใช้ท่า</h2>${order}
      <div class="row"><label class="k" for="guardAt">ใช้ระฆังทองเมื่อเลือดต่ำกว่า</label><select id="guardAt" data-set="guardAt">${[0.3, 0.4, 0.5, 0.6].map(v => `<option value="${v}" ${S.guardAt == v ? "selected" : ""}>${pct(v)}</option>`).join("")}</select></div>
      <div class="row"><label class="k" for="palmMin">ใช้ฝ่ามือเมื่อศัตรูในระยะอย่างน้อย</label><select id="palmMin" data-set="palmMin">${[1, 2, 3].map(v => `<option value="${v}" ${S.palmMin == v ? "selected" : ""}>${v} ตัว</option>`).join("")}</select></div>
    </div>
    <div class="card"><h2>โหมดศึกษา</h2><div class="row"><label class="k" for="studyTech">วิชาที่จะศึกษา</label><select id="studyTech" data-set="studyTech">${studyOpts}</select></div><div class="sub">ศึกษา = ความชำนาญ +3/วิ (คูณความเข้าใจ) · ใช้ได้ตอนออฟไลน์ด้วย</div></div>
    ${manual}
    <div class="card"><h2>แกนปราณโบราณ</h2><div class="row"><span>วิเคราะห์ท่าของ ดาบเสือดำ</span><b>${S.analysis}%</b></div><div class="meter"><i class="m" style="width:${S.analysis}%"></i></div><div class="sub">ฆ่าบอสครั้งละ +5% · ถึง 50% ดาเมจใส่บอส +15% · ถึง 100% ได้วิชาบอส</div></div>
    ${missing ? `<div class="card"><h2>วิชาที่ยังไม่ได้</h2>${missing}</div>` : ""}`;
  }
  function panelMer() {
    const S = g.S;
    const dots = G.MERIDIAN.map((n, i) => `<span class="dot ${i < S.nodes ? "open" : ""} ${S.path === "demonic" ? "dem" : ""}"></span>`).join("");
    const rows = G.MERIDIAN.map((n, i) => {
      const open = i < S.nodes, next = i === S.nodes;
      let txt = n.txt || "";
      if (n.choice) txt = S.path ? (S.path === "righteous" ? "สายธรรมะ: " + n.rtxt : "สายมาร: " + n.dtxt) : "ธรรมะ: " + n.rtxt + "<br>มาร: " + n.dtxt;
      let act = open ? `<b class="ok">เปิดแล้ว</b>` : "";
      if (next) {
        if (n.choice && !S.path) act = `<span class="btns"><button data-act="path" data-v="righteous">เลือกธรรมะ</button><button data-act="path" data-v="demonic" class="danger">เลือกมาร</button></span>`;
        else act = `<button data-act="node" ${S.qi >= n.cost ? "class=\"primary\"" : "disabled"}>เปิด · ${fmt(n.cost)} ปราณ</button>`;
      }
      return `<div class="item ${!open && !next ? "dim" : ""}"><span class="ic"><b>${i + 1}</b></span><div class="t"><b>${n.n}</b><span class="sub">${txt}</span></div>${act}</div>`;
    }).join("");
    return `<div class="card"><h2>เส้นลมปราณหัวใจ</h2>
      <div class="mer-art">${img("assets/system/meridian_body.png")}<div class="dots">${dots}</div></div>
      <div class="sub">จ่ายปราณเปิดทีละจุด · จุดที่ 3 ต้องเลือกสาย เลือกแล้วเปลี่ยนไม่ได้${S.path ? " · สายของท่าน: <b>" + (S.path === "righteous" ? "ธรรมะ" : "มาร") + "</b>" : ""}</div>
      <div class="nodes">${rows}</div></div>`;
  }
  function costTxt(cost, mats) {
    const S = g.S;
    let ok = S.taels >= cost, parts = [fmt(cost) + " ตำลึง"];
    for (const k in (mats || {})) { const have = S.mats[k] || 0; if (have < mats[k]) ok = false; parts.push(G.MATS[k].n + " " + have + "/" + mats[k]); }
    return { ok, txt: parts.join(" · ") };
  }
  function panelShop() {
    const S = g.S;
    const gear = (arr, cur, act, label) => arr.map((it, i) => {
      if (i === 0) return "";
      const owned = cur >= i, c = costTxt(it.cost, it.mats), nextUp = i === cur + 1;
      return `<div class="item ${owned || nextUp ? "" : "dim"}">${ic(it.icon, it.n[0])}<div class="t"><b>${it.n}</b><span class="sub">${label(it)} · ${c.txt}</span></div>${owned ? `<b class="ok">มีแล้ว</b>` : `<button data-act="${act}" data-v="${i}" ${nextUp && c.ok ? "class=\"primary\"" : "disabled"}>ตี</button>`}</div>`;
    }).join("");
    const pills = Object.keys(G.PILLS).map(k => {
      const p = G.PILLS[k], c = costTxt(p.cost, p.mats);
      const use = k !== "brk" ? `<button data-act="usePill" data-v="${k}" ${S.pills[k] ? "" : "disabled"}>ใช้</button>` : "";
      return `<div class="item">${ic(p.icon, p.n[0])}<div class="t"><b>${p.n} <span class="sub">มี ${S.pills[k] || 0}</span></b><span class="sub">${p.desc} · ${c.txt}</span></div><span class="btns"><button data-act="buyPill" data-v="${k}" ${c.ok ? "" : "disabled"}>ซื้อ</button>${use}</span></div>`;
    }).join("");
    const manuals = G.MANUALS.map(m => {
      const t = G.TECH[m.t], has = m.t in S.techs;
      return `<div class="item">${ic(t.icon, t.n[0])}<div class="t"><b>${t.n}</b><span class="sub">${t.desc} · ${fmt(m.cost)} ตำลึง</span></div>${has ? `<b class="ok">เรียนแล้ว</b>` : `<button data-act="buyManual" data-v="${m.t}" ${S.taels >= m.cost ? "class=\"primary\"" : "disabled"}>เรียน</button>`}</div>`;
    }).join("");
    const mats = Object.keys(G.MATS).map(k => `<div class="row"><span>${G.MATS[k].n}</span><b>${S.mats[k] || 0}</b></div>`).join("");
    return `<div class="card"><h2>โรงตีเหล็ก</h2><div class="sub">อาวุธ: ${G.WEAPONS[S.wpn].n} · ชุด: ${G.ARMORS[S.arm].n}</div>
      ${gear(G.WEAPONS, S.wpn, "buyWpn", it => "พลังอาวุธ " + it.pow)}${gear(G.ARMORS, S.arm, "buyArm", it => "ป้องกัน " + it.def)}</div>
      <div class="card"><h2>ร้านยา</h2>${pills}</div>
      <div class="card"><h2>หอคัมภีร์</h2>${manuals}</div>
      <div class="card"><h2>วัตถุดิบ</h2><div class="grid2">${mats}</div></div>`;
  }
  function panelMap() {
    const S = g.S;
    return `<div class="card"><h2>ภูมิภาค 1 · ชายแดนป่าไผ่</h2>` + G.MAPS.map((mp, i) => {
      const open = g.unlocked(i), r = g.rates(i), q = mp.req;
      const mons = [...new Set(mp.mons)].map(id => G.MON[id].n).join(", ");
      const info = open ? `${mons}<br>${fmt(r.exp * 3600)} EXP/ชม. · ${fmt(r.taels * 3600)} ตำลึง/ชม.${r.danger ? ' · <span class="no">อันตรายเกินไป</span>' : ""}` : `ปราบ ${G.MON[q.m].n} ${Math.min(Math.floor(S.kills[q.m] || 0), q.k)}/${q.k}`;
      return `<div class="item ${open ? "" : "dim"}"><span class="ic"><b>${i + 1}</b></span><div class="t"><b>${mp.n}</b><span class="sub">${info}</span></div>${S.map === i ? `<b class="ok">อยู่ที่นี่</b>` : `<button data-act="map" data-v="${i}" ${open ? "" : "disabled"}>ไป</button>`}</div>`;
    }).join("") + `<div class="sub">ออฟไลน์ในโหมดต่อสู้ ได้ 50% ของอัตรานี้ (สูงสุด 12 ชม.)</div></div>`;
  }
  let resetArm = false;
  function panelAcc() {
    const u = sv.user;
    const acc = u ? `<div class="row"><span>ล็อกอินเป็น</span><b>${u.email}</b></div><div class="btns"><button data-act="sync">ซิงก์ตอนนี้</button><button data-act="pull">โหลดเซฟจากคลาวด์</button><button data-act="logout">ออกจากระบบ</button></div>`
      : `<div class="sub">ยังไม่ได้ล็อกอิน เซฟอยู่แค่ในเครื่องนี้</div><button data-act="toLogin" class="primary">ล็อกอิน / สมัคร</button>`;
    return `<div class="card"><h2>บัญชี</h2>${acc}</div>
      <div class="card"><h2>ติดตั้งเป็นแอป</h2><div class="sub">Android (Chrome): เมนู ⋮ แล้วกด "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"<br>iPhone (Safari): ปุ่มแชร์ แล้วกด "เพิ่มไปยังหน้าจอโฮม"</div></div>
      <div class="card"><h2>ชื่อตัวเอก</h2><div class="row"><input id="nameIn" maxlength="12" value="${g.S.name}"><button data-act="rename">เปลี่ยน</button></div></div>
      <div class="card"><h2>เริ่มใหม่</h2><div class="sub">ลบความคืบหน้าทั้งหมด${u ? " รวมถึงบนคลาวด์" : ""}</div>${resetArm ? `<div class="btns"><button data-act="resetYes" class="danger">ยืนยัน ลบทั้งหมด</button><button data-act="resetNo">ยกเลิก</button></div>` : `<button data-act="reset" class="danger">เริ่มใหม่</button>`}</div>`;
  }
  const PANELS = { char: panelChar, tech: panelTech, mer: panelMer, shop: panelShop, map: panelMap, acc: panelAcc };
  function renderPanel() { $("panel").innerHTML = PANELS[tab](); }
  function renderAll() { renderHud(); renderPanel(); }

  // ---------- modals ----------
  function modal(html) { $("modalBox").innerHTML = html; $("modal").hidden = false; }
  function closeModal() { $("modal").hidden = true; }
  function showOffline(o) {
    const h = Math.floor(o.sec / 3600), m = Math.floor(o.sec % 3600 / 60);
    const what = o.mode === "fight" ? "ออกล่าในป่า" : o.mode === "meditate" ? "ปิดด่านฝึกตน" : "ศึกษาคัมภีร์";
    const mats = Object.keys(o.mats).map(k => `<div class="row"><span>${G.MATS[k].n}</span><b>+${o.mats[k]}</b></div>`).join("");
    modal(`<h3>ระหว่างที่ท่านไม่อยู่…</h3><div class="sub">${g.S.name} ${what} ${h} ชม. ${m} นาที${o.sec >= G.CFG.OFFLINE_CAP ? " (สูงสุด 12 ชม.)" : ""}</div>
      <div class="row"><span>EXP</span><b>+${fmt(o.exp)}${o.lv ? " · +" + o.lv + " Lv" : ""}</b></div>
      ${o.taels ? `<div class="row"><span>ตำลึง</span><b>+${fmt(o.taels)}</b></div>` : ""}
      ${o.qi ? `<div class="row"><span>ปราณ</span><b>+${fmt(o.qi)}</b></div>` : ""}
      ${o.mastery ? `<div class="row"><span>ความชำนาญ ${G.TECH[o.mastery[0]].n}</span><b>เพิ่มขึ้น</b></div>` : ""}${mats}
      <button data-act="close" class="primary">รับผลการฝึก</button>`);
  }
  function showCave() {
    modal(`<h3>พบถ้ำลับ</h3><div class="sub">ระหว่างไล่ล่า ท่านสังเกตเห็นปากถ้ำที่ซ่อนอยู่หลังน้ำตก ลมเย็นพัดออกมาพร้อมกลิ่นธูปเก่า</div>
      <div class="btns"><button data-act="cave" data-v="1" class="primary">เข้าไป</button><button data-act="cave" data-v="0">ผ่านไป</button></div>`);
  }

  // ---------- actions ----------
  function spend(cost, mats) {
    const S = g.S; if (S.taels < cost) return false;
    for (const k in (mats || {})) if ((S.mats[k] || 0) < mats[k]) return false;
    S.taels -= cost; for (const k in (mats || {})) S.mats[k] -= mats[k];
    return true;
  }
  document.addEventListener("click", async e => {
    const tb = e.target.closest("[data-tab]");
    if (tb) { tab = tb.dataset.tab; document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b === tb)); renderPanel(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const S = g.S, v = b.dataset.v, a = b.dataset.act;
    switch (a) {
      case "mode": S.mode = v; if (v === "fight") g.enterMap(S.map); log(v === "fight" ? "กลับสู่สนามต่อสู้" : v === "meditate" ? "เข้าปิดด่านฝึกตน" : "เริ่มศึกษา " + G.TECH[S.studyTech].n); break;
      case "stat": if (S.pts > 0) { S[v]++; S.pts--; } break;
      case "break": { const r = g.breakthrough(); if (r !== null) cloudPush(); break; }
      case "up": case "down": { const i = S.order.indexOf(v), j = a === "up" ? i - 1 : i + 1; if (j >= 0 && j < S.order.length) [S.order[i], S.order[j]] = [S.order[j], S.order[i]]; break; }
      case "read": { const r = g.readManual(); if (r) log(r.txt); break; }
      case "path": g.choosePath(v); log("เลือกเดิน" + (v === "righteous" ? "สายธรรมะ" : "สายมาร") + " แล้ว"); break;
      case "node": g.openNode(); break;
      case "buyWpn": { const i = +v, it = G.WEAPONS[i]; if (i === S.wpn + 1 && spend(it.cost, it.mats)) { S.wpn = i; log("ได้ " + it.n); } break; }
      case "buyArm": { const i = +v, it = G.ARMORS[i]; if (i === S.arm + 1 && spend(it.cost, it.mats)) { S.arm = i; log("ได้ " + it.n); } break; }
      case "buyPill": { const p = G.PILLS[v]; if (spend(p.cost, p.mats)) { S.pills[v] = (S.pills[v] || 0) + 1; log("ได้ " + p.n); } break; }
      case "usePill":
        if (!S.pills[v]) break;
        S.pills[v]--;
        if (v === "heal") { S.injuryUntil = 0; g.R.p.hp = g.st().maxHp; log("แผลภายในหายสนิท"); }
        if (v === "qi") { S.qi += 400; log("ปราณ +400"); }
        break;
      case "buyManual": { const m = G.MANUALS.find(x => x.t === v); if (m && !(v in S.techs) && spend(m.cost)) g.learn(v); break; }
      case "map": if (g.unlocked(+v)) { S.mode = "fight"; g.enterMap(+v); log("เดินทางสู่ " + G.MAPS[+v].n); } break;
      case "cave": { const r = g.resolveCave(v === "1"); modal(`<h3>${v === "1" ? "ในถ้ำ" : "ผ่านไป"}</h3><div class="${r.bad ? "no" : ""}">${r.txt}</div><button data-act="close" class="primary">ตกลง</button>`); renderAll(); return; }
      case "close": closeModal(); break;
      case "sync": cloudPush(); break;
      case "pull": { const c = await sv.pullCloud(); if (c) { start(c, "cloud"); } break; }
      case "useCloud": { const c = await sv.pullCloud(); $("conflict").hidden = true; if (c) start(c, "cloud"); break; }
      case "forcePush": $("conflict").hidden = true; cloudPush(true); break;
      case "logout": sv.saveLocal(S); await sv.signOut(); sv.guest(false); showLogin("ออกจากระบบแล้ว"); return;
      case "toLogin": sv.guest(false); showLogin(""); return;
      case "rename": { const n = $("nameIn").value.trim(); if (n) { S.name = n; log("เปลี่ยนชื่อเป็น " + n); } break; }
      case "reset": resetArm = true; break;
      case "resetNo": resetArm = false; break;
      case "resetYes": resetArm = false; g.S = g.fresh(); g.enterMap(0); sv.saveLocal(g.S); if (sv.user) cloudPush(true); log("เริ่มต้นใหม่แล้ว"); break;
    }
    renderAll();
  });
  document.addEventListener("change", e => {
    const k = e.target.dataset.set; if (!k) return;
    g.S[k] = k === "studyTech" ? e.target.value : +e.target.value;
    renderAll();
  });

  // ---------- boot ----------
  (async () => {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
    const u = await sv.session();
    if (u) { try { await startFromCloud(); } catch (e) { start(sv.loadLocal(), "local"); } }
    else if (sv.isGuest()) start(sv.loadLocal(), "local");
    else showLogin("");
  })();
})();
