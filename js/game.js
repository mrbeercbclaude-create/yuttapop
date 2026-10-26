// Game state, rules, combat simulation and rendering.
G.game = (() => {
  const C = G.CFG, W = C.W, H = C.H, GROUND = C.GROUND;
  let S = null;
  const R = { mons: [], p: null, floats: [], fxs: [], cds: {}, ko: 0, t: 0, rateCache: null, rateAt: -1, events: [] };

  // ---------- state ----------
  function fresh() {
    return {
      v: 1, t: Date.now(), owner: null, name: "ชองมุน",
      lv: 1, exp: 0, pts: 0, str: 5, agi: 1, comp: 1, luk: 1,
      realm: 0, insight: 0,
      taels: 0, qi: 0, mats: {}, pills: { heal: 1, qi: 0, brk: 0 },
      wpn: 0, arm: 0,
      techs: { cloud: 0, step: 0, heart: 0 }, manuals: {},
      order: ["tiger", "palm", "star"], guardAt: 0.4, palmMin: 1,
      nodes: 0, path: null,
      kills: {}, map: 0, mode: "fight", studyTech: "cloud",
      analysis: 0, injuryUntil: 0, pendingEvent: null
    };
  }
  function migrate(o) { const f = fresh(); for (const k in f) if (!(k in o)) o[k] = f[k]; return o; }

  // ---------- formulas ----------
  function expReq(L) {
    return (15 + Math.pow(L, 1.9) + 11 * L) * Math.pow(1.208 - Math.min(0.164, 0.215 * L / (L + 100)), L) - 15;
  }
  function dmgTaken(d, def) {
    if (d <= 0) return 0;
    let r = d - 2.5 * Math.pow(def, 0.8);
    r = r / Math.max(1 + def / Math.max(d, 1) * Math.pow(def, 1.5) / 100, 1);
    return r < 0.5 ? 0 : Math.ceil(r);
  }
  function monReduce(raw, def) { return raw * 100 / (100 + def * 1.5); }
  function tier(id) {
    if (!(id in S.techs)) return -1;
    let t = 0; G.TIERS.forEach(([, need], i) => { if (S.techs[id] >= need) t = i; });
    return t;
  }
  function meridianFx() {
    const m = { atk: 0, crit: 0, critDmg: 0, def: 0, hp: 0, aspd: 0, regen: 0, brk: 0 };
    for (let i = 0; i < S.nodes; i++) {
      const n = G.MERIDIAN[i], e = n.choice ? n[S.path || "righteous"] : n.eff;
      for (const k in e) m[k] += e[k];
    }
    return m;
  }
  function injured() { return Date.now() < S.injuryUntil; }
  function st() {
    const m = meridianFx(), rm = G.REALMS[S.realm].mult, ts = tier("step"), th = tier("heart");
    const maxDmg = (6 + G.WEAPONS[S.wpn].pow * 2) * (1 + S.str * 0.05) * rm * (1 + m.atk) * (injured() ? 0.7 : 1);
    const aspd = 1 + S.agi * 0.015 + (ts >= 0 ? 0.04 + 0.03 * ts : 0) + m.aspd;
    return {
      maxDmg, mastery: Math.min(0.8, 0.35 + S.comp * 0.003),
      interval: 1 / aspd,
      crit: Math.min(0.6, 0.05 + S.agi * 0.003 + S.luk * 0.002 + m.crit),
      critDmg: 1.5 + m.critDmg,
      maxHp: Math.round((30 + S.lv * 9 + S.str * 3) * rm * (1 + m.hp)),
      def: Math.round((G.ARMORS[S.arm].def + Math.floor(S.lv / 3)) * (1 + m.def)),
      regen: (0.015 + (th >= 0 ? 0.004 * th : 0)) * (1 + m.regen) * (injured() ? 0 : 1),
      move: 120 * (1 + (ts >= 0 ? 0.1 + 0.05 * ts : 0)),
      qiMul: 1 + (th >= 0 ? 0.1 * th : 0),
      coinMul: 1 + S.luk * 0.02,
      brk: m.brk, m
    };
  }
  function techMult(id) { return G.TECH[id].mult * (1 + 0.15 * Math.max(0, tier(id))); }
  function techCd(id) { return G.TECH[id].cd * (1 - 0.06 * Math.max(0, tier(id))); }
  function realmCap() { return G.REALMS[S.realm].cap; }

  // Expected per-second gains while fighting on a map; drives meditation, offline and the map panel.
  function rates(mi) {
    if (R.rateAt === mi && R.rateCache && R.rateCacheT > R.t - 1) return R.rateCache;
    const s = st(), mons = G.MAPS[mi].mons;
    let exp = 0, taels = 0, qi = 0, danger = false; const kills = {}, drops = {};
    for (const id of mons) {
      const d = G.MON[id];
      const avg = s.maxDmg * (1 + s.mastery) / 2 * (1 + s.crit * (s.critDmg - 1)) * 1.35;
      const hit = Math.max(1, monReduce(avg, d.def));
      const ttk = Math.ceil(d.hp / hit) * s.interval + 1.5;
      const per = Math.min(1 / ttk, 1 / d.rs) / mons.length;
      if (dmgTaken(d.dmg, s.def) * (ttk / 1.5) >= s.maxHp * 1.6) danger = true;
      exp += per * d.exp; taels += per * d.exp * 1.5 * s.coinMul; qi += per * Math.ceil(d.exp * 0.4) * s.qiMul;
      kills[id] = (kills[id] || 0) + per;
      if (d.drop) drops[d.drop[0]] = (drops[d.drop[0]] || 0) + per * d.drop[1] * (1 + S.luk * 0.01);
    }
    const out = { exp, taels, qi, kills, drops, danger };
    R.rateCache = out; R.rateAt = mi; R.rateCacheT = R.t;
    return out;
  }
  function qiRate() { return (0.5 + S.lv * 0.15) * G.REALMS[S.realm].mult * st().qiMul; }

  // ---------- progression ----------
  function addExp(a) {
    S.exp += a;
    let up = false;
    while (S.lv < realmCap() && S.exp >= expReq(S.lv)) { S.exp -= expReq(S.lv); S.lv++; S.pts += 3; up = true; }
    if (S.lv >= realmCap()) S.exp = Math.min(S.exp, expReq(S.lv));
    if (up && R.p) { R.p.hp = st().maxHp; float(R.p.x, GROUND - 120, "Lv " + S.lv, "#e3b45c", 22); log("เลเวลขึ้นเป็น " + S.lv + " · ได้แต้มพลังยุทธ์ 3 แต้ม"); }
    return up;
  }
  function gainM(id, amt) {
    if (!(id in S.techs)) return;
    const before = tier(id);
    S.techs[id] += amt * (1 + S.comp * 0.02);
    const after = tier(id);
    if (after > before) { log(G.TECH[id].n + " ถึงขั้น " + G.TIERS[after][0]); if (R.p) float(R.p.x, GROUND - 140, G.TECH[id].n + " · " + G.TIERS[after][0], "#8fc8ff", 16); }
  }
  function learn(id) {
    if (id in S.techs) return false;
    S.techs[id] = 0;
    if (G.TECH[id].kind === "active" && !S.order.includes(id)) S.order.unshift(id);
    log("ได้เรียนวิชา " + G.TECH[id].n);
    return true;
  }
  function breakReq() {
    const nx = G.REALMS[S.realm + 1]; if (!nx) return null;
    const q = nx.req, s = st();
    const tierCount = Object.keys(S.techs).filter(id => tier(id) >= q.techTier[0]).length;
    const items = [
      { txt: "เลเวล " + q.lv, ok: S.lv >= q.lv },
      { txt: "วิชาขั้น " + G.TIERS[q.techTier[0]][0] + " ขึ้นไป " + q.techTier[1] + " วิชา (มี " + tierCount + ")", ok: tierCount >= q.techTier[1] }
    ];
    if (q.nodes) items.push({ txt: "เปิดจุดลมปราณ " + q.nodes + " จุด (เปิด " + S.nodes + ")", ok: S.nodes >= q.nodes });
    if (q.pills) items.push({ txt: G.PILLS.brk.n + " ×" + q.pills + " (มี " + (S.pills.brk || 0) + ")", ok: (S.pills.brk || 0) >= q.pills });
    const chance = Math.min(1, q.base + S.comp * 0.002 + S.insight * 0.05 + s.brk);
    return { next: nx, items, chance, ready: items.every(i => i.ok) };
  }
  function breakthrough() {
    const b = breakReq(); if (!b || !b.ready) return null;
    S.pills.brk = (S.pills.brk || 0) - (b.next.req.pills || 0);
    if (Math.random() < b.chance) {
      S.realm++; S.insight = 0;
      R.p.hp = st().maxHp; R.p.pose = "breakthrough"; R.p.poseT = 2.2;
      addFx("fx/fx_breakthrough", R.p.x, GROUND - 90, 260, 2.2, 1);
      float(R.p.x, GROUND - 150, "ทะลวงขั้น! " + b.next.n, "#e3b45c", 26, "Charm");
      log("ทะลวงขั้นสำเร็จ สู่ " + b.next.n);
      return true;
    }
    S.insight++;
    float(R.p.x, GROUND - 130, "ปราณแตกซ่าน… ความเข้าใจ +5%", "#8fc8ff", 18);
    log("ทะลวงขั้นไม่สำเร็จ แต่เข้าใจตัวเองมากขึ้น (โอกาสครั้งหน้า +5%)");
    return false;
  }
  function openNode() {
    const n = G.MERIDIAN[S.nodes]; if (!n || S.qi < n.cost) return false;
    if (n.choice && !S.path) return false;
    S.qi -= n.cost; S.nodes++;
    log("เปิด" + n.n + " สำเร็จ");
    return true;
  }
  function choosePath(p) { if (S.path) return; S.path = p; }

  // ---------- world ----------
  function float(x, y, txt, col, size, font) { R.floats.push({ x, y, txt, col, t: 0, size: size || 15, font: font || "Sarabun" }); }
  function addFx(key, x, y, size, dur, dir, blue) { R.fxs.push({ key, x, y, size, dur, t: 0, dir: dir || 1, blue }); }
  let logFn = () => {};
  function log(m) { logFn(m); }
  function unlocked(mi) { const r = G.MAPS[mi].req; return !r || Math.floor(S.kills[r.m] || 0) >= r.k; }

  function enterMap(mi) {
    S.map = mi;
    const mons = G.MAPS[mi].mons;
    R.mons = mons.map((id, i) => {
      const x = 220 + (i + 0.5) * (W - 250) / mons.length;
      return { id, x, home: x, dir: Math.random() < .5 ? -1 : 1, hp: G.MON[id].hp, alive: true, t: 0, flash: 0, aggro: 0, hitCd: 0, kb: 0, bob: Math.random() * 6, atkT: 0 };
    });
    const hp = R.p ? R.p.hp : st().maxHp;
    R.p = { x: 70, hp: Math.min(hp, st().maxHp), dir: 1, cd: 0, swing: 0, target: null, walk: 0, goalX: null, pose: "idle", poseT: 0, shield: 0, shieldT: 0, hurtT: 0 };
    R.floats = []; R.fxs = []; R.ko = 0; R.rateAt = -1;
  }

  function damage(m, mult, label) {
    const s = st(), d = G.MON[m.id];
    let roll = s.maxDmg * mult * (s.mastery + Math.random() * (1 - s.mastery));
    const crit = Math.random() < s.crit; if (crit) roll *= s.critDmg;
    if (d.boss && S.analysis >= 50) roll *= 1.15;
    const dealt = Math.max(1, Math.round(monReduce(roll, d.def)));
    m.hp -= dealt; m.flash = 0.12; m.kb = (mult > 1 ? 18 : 8) * R.p.dir; m.aggro = 6;
    float(m.x + (Math.random() - .5) * 16, GROUND - d.h - 6, (crit ? "치명! " : "") + dealt, mult > 1 ? "#8fc8ff" : crit ? "#ffd27a" : "#ffffff", crit || mult > 1 ? 19 : 15);
    if (m.hp <= 0) kill(m);
  }
  function kill(m) {
    const d = G.MON[m.id], s = st();
    m.alive = false; m.t = d.rs; if (R.p.target === m) R.p.target = null;
    const taels = Math.max(1, Math.round(d.exp * 1.5 * s.coinMul * (0.6 + Math.random() * 0.8)));
    const qi = Math.ceil(d.exp * 0.4 * s.qiMul);
    S.kills[m.id] = (S.kills[m.id] || 0) + 1; S.taels += taels; S.qi += qi;
    addExp(d.exp);
    float(m.x, GROUND - d.h - 28, "+" + d.exp + " EXP", "#9fd2ff", 14);
    float(m.x + 22, GROUND - d.h - 12, "+" + taels + " ตำลึง", "#e3b45c", 14);
    if (d.drop && Math.random() < d.drop[1] * (1 + S.luk * 0.01)) {
      const k = d.drop[0]; S.mats[k] = (S.mats[k] || 0) + 1;
      float(m.x, GROUND - d.h - 44, "+" + G.MATS[k].n, "#7fd18f", 14);
    }
    if (d.manual && !("palm" in S.techs) && !S.manuals.palm && Math.random() < d.manual * (1 + S.luk * 0.01)) {
      S.manuals.palm = 1; log("ได้ คัมภีร์ฝ่ามือฉีกขาด! ไปอ่านในแท็บวิชา");
      float(m.x, GROUND - d.h - 60, "คัมภีร์ฉีกขาด!", "#e3b45c", 18, "Charm");
    }
    if (d.boss && S.analysis < 100) {
      S.analysis = Math.min(100, S.analysis + 5);
      log("แกนปราณโบราณ: วิเคราะห์ท่าของ " + d.n + " " + S.analysis + "%");
      if (S.analysis >= 100 && learn("tiger")) float(R.p.x, GROUND - 150, "วิเคราะห์สำเร็จ! ดาบเสือดำผ่าภูผา", "#8fc8ff", 20, "Charm");
    }
    if (!S.pendingEvent && Math.random() < 0.004 * (1 + S.luk * 0.01)) S.pendingEvent = "cave";
    const nx = G.MAPS.findIndex(mp => mp.req && mp.req.m === m.id && Math.floor(S.kills[m.id]) === mp.req.k);
    if (nx > 0) log("ทางไป " + G.MAPS[nx].n + " เปิดแล้ว");
  }
  function nearest() {
    let best = null, bd = 1e9;
    for (const m of R.mons) if (m.alive) { const d = Math.abs(m.x - R.p.x); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  function inRange(x, r) { return R.mons.filter(m => m.alive && Math.abs(m.x - x) <= r); }

  function attack(target) {
    const p = R.p, s = st();
    for (const id of S.order) {
      if (!(id in S.techs) || (R.cds[id] || 0) > 0) continue;
      const tk = G.TECH[id];
      if (id === "palm") {
        const hits = inRange(p.x + p.dir * 40, tk.aoe);
        if (hits.length < S.palmMin) continue;
        hits.forEach(m => damage(m, techMult(id)));
      } else damage(target, techMult(id));
      R.cds[id] = techCd(id); gainM(id, 4);
      p.pose = tk.pose || "skill"; p.poseT = 0.35;
      addFx("fx/" + tk.fx, p.x + p.dir * 44, GROUND - 46, id === "palm" ? 120 : 110, 0.35, p.dir, true);
      float(p.x, GROUND - 128, tk.n + "!", "#8fc8ff", 19, "Charm");
      p.cd = s.interval; p.swing = 1;
      return;
    }
    damage(target, techMult("cloud")); gainM("cloud", 1);
    p.pose = "attack1"; p.poseT = 0.18; p.cd = s.interval; p.swing = 1;
    addFx("fx/fx_slash_white", p.x + p.dir * 34, GROUND - 46, 80, 0.2, p.dir);
  }

  function tick(dt) {
    R.t += dt;
    const p = R.p, s = st();
    for (const k in R.cds) R.cds[k] = Math.max(0, R.cds[k] - dt);
    for (const f of R.floats) { f.t += dt; f.y -= 26 * dt; }
    R.floats = R.floats.filter(f => f.t < 1.3);
    for (const f of R.fxs) f.t += dt;
    R.fxs = R.fxs.filter(f => f.t < f.dur);
    p.poseT = Math.max(0, p.poseT - dt); p.swing = Math.max(0, p.swing - dt * 4); p.hurtT = Math.max(0, p.hurtT - dt);
    if (p.hp > s.maxHp) p.hp = s.maxHp;

    if (S.mode !== "fight") {
      const r = rates(S.map);
      if (S.mode === "meditate") { addExp(r.exp * 0.35 * dt); S.qi += qiRate() * dt; gainM("heart", dt); }
      else { gainM(S.studyTech, 3 * dt); addExp(r.exp * 0.1 * dt); }
      p.hp = Math.min(s.maxHp, p.hp + s.maxHp * Math.max(s.regen, 0.02) * dt);
      return;
    }

    if (R.ko > 0) { R.ko -= dt; if (R.ko <= 0) { p.hp = s.maxHp * 0.5; p.x = 70; } }
    else p.hp = Math.min(s.maxHp, p.hp + s.maxHp * s.regen * dt);
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = 0; }

    let move = 0;
    if (R.ko <= 0) {
      if (p.goalX !== null) { const dx = p.goalX - p.x; if (Math.abs(dx) < 4) p.goalX = null; else move = Math.sign(dx); }
      if (p.target && !p.target.alive) p.target = null;
      if (!p.target && p.goalX === null) p.target = nearest();
      if (p.target && !move) {
        const dx = p.target.x - p.x;
        if (Math.abs(dx) > C.REACH) move = Math.sign(dx);
        else { p.dir = Math.sign(dx) || p.dir; if (p.cd <= 0) attack(p.target); }
        gainM("step", 0.2 * dt);
      }
      if ("bell" in S.techs && (R.cds.bell || 0) <= 0 && p.hp < s.maxHp * S.guardAt) {
        p.shield = s.maxHp * (0.25 + 0.05 * tier("bell")); p.shieldT = 5; R.cds.bell = techCd("bell"); gainM("bell", 5);
        float(p.x, GROUND - 130, "ระฆังทองคุ้มกาย!", "#e3b45c", 18, "Charm");
      }
    }
    p.cd -= dt;
    if (move) { p.dir = move; p.x = Math.max(20, Math.min(W - 20, p.x + move * s.move * dt)); p.walk += dt; }
    p.moving = !!move;

    for (const m of R.mons) {
      const d = G.MON[m.id];
      m.flash = Math.max(0, m.flash - dt); m.kb *= 0.8; m.x += m.kb * dt * 10; m.bob += dt * 6; m.atkT = Math.max(0, m.atkT - dt);
      if (!m.alive) { m.t -= dt; if (m.t <= 0) { m.alive = true; m.hp = d.hp; m.x = m.home; m.aggro = 0; } continue; }
      m.aggro = Math.max(0, m.aggro - dt); m.hitCd -= dt;
      if (m.aggro > 0 && R.ko <= 0) { const dx = p.x - m.x; if (Math.abs(dx) > 18) { m.dir = Math.sign(dx); m.x += m.dir * d.spd * 1.4 * dt; } }
      else { m.x += m.dir * d.spd * dt; if (Math.abs(m.x - m.home) > 50) m.dir = -Math.sign(m.x - m.home); }
      m.x = Math.max(30, Math.min(W - 30, m.x));
      if (R.ko <= 0 && d.dmg > 0 && Math.abs(m.x - p.x) < 26 + d.h * 0.15 && m.hitCd <= 0) {
        m.hitCd = 1.5; m.atkT = 0.4;
        let dmg = dmgTaken(d.dmg, s.def);
        if (p.shield > 0) { const ab = Math.min(p.shield, dmg); p.shield -= ab; dmg -= ab; }
        p.hp -= dmg; p.hurtT = dmg ? 0.25 : 0;
        float(p.x, GROUND - 100, dmg ? "-" + dmg : "ปัดป้อง", dmg ? "#ff8a78" : "#cfd3e8", 15);
        if (p.hp <= 0) {
          p.hp = 0; R.ko = 3; p.target = null; S.injuryUntil = Date.now() + 120000;
          log("พ่ายแพ้ให้ " + d.n + " · บาดเจ็บภายใน 2 นาที (ดาเมจ −30%) · กินยารักษาแผลในเพื่อหายทันที");
        }
      }
    }
  }

  // ---------- offline ----------
  function offline(sec) {
    sec = Math.min(C.OFFLINE_CAP, Math.max(0, sec));
    const lv0 = S.lv, out = { sec, mode: S.mode, exp: 0, taels: 0, qi: 0, mats: {}, mastery: null, lv: 0 };
    const r = rates(S.map);
    if (S.mode === "fight") {
      const f = 0.5 * (r.danger ? 0.1 : 1);
      out.exp = r.exp * f * sec; out.taels = r.taels * f * sec; out.qi = r.qi * f * sec;
      for (const k in r.kills) S.kills[k] = (S.kills[k] || 0) + r.kills[k] * f * sec;
      for (const k in r.drops) { const n = Math.floor(r.drops[k] * f * sec + Math.random()); if (n > 0) { out.mats[k] = n; S.mats[k] = (S.mats[k] || 0) + n; } }
      gainM("step", 0.1 * sec);
    } else if (S.mode === "meditate") {
      out.exp = r.exp * 0.35 * sec; out.qi = qiRate() * sec; gainM("heart", sec); out.mastery = ["heart", sec];
    } else {
      out.exp = r.exp * 0.1 * sec; gainM(S.studyTech, 3 * sec); out.mastery = [S.studyTech, 3 * sec];
    }
    S.taels += out.taels; S.qi += out.qi; addExp(out.exp);
    out.lv = S.lv - lv0;
    return out;
  }

  // ---------- encounters ----------
  function resolveCave(enter) {
    S.pendingEvent = null;
    if (!enter) return { txt: "ท่านเดินผ่านปากถ้ำไป ไม่หันกลับมามอง" };
    const roll = Math.random() * (1 + S.luk * 0.01);
    const learned = Object.keys(S.techs);
    if (roll < 0.10) { S.injuryUntil = Date.now() + 120000; return { txt: "กับดักลูกดอกพิษ! บาดเจ็บภายใน 2 นาที", bad: true }; }
    if (roll < 0.45) { const id = learned[Math.floor(Math.random() * learned.length)]; gainM(id, 300); return { txt: "พบคัมภีร์เก่าในซอกหิน · ความชำนาญ " + G.TECH[id].n + " +300" }; }
    if (roll < 0.70) { S.mats.spirit_grass = (S.mats.spirit_grass || 0) + 5; return { txt: "พบดงหญ้าวิญญาณ · +5 " + G.MATS.spirit_grass.n }; }
    if (roll < 0.90) { const n = S.lv * 120; S.taels += n; return { txt: "พบหีบสมบัติของโจรที่ถูกลืม · +" + n + " ตำลึง" }; }
    S.comp += 1; return { txt: "พบซากยอดฝีมือนั่งสมาธิ ท่าทางของเขาทำให้ท่านตาสว่าง · ความเข้าใจ +1 ถาวร" };
  }
  function readManual() {
    if (!S.manuals.palm) return null;
    if (S.comp < 25) return { ok: false, txt: "อ่านไม่ออก 3 หน้าสุดท้าย (ต้องมีความเข้าใจ 25 · ตอนนี้ " + S.comp + ")" };
    S.manuals.palm = 0; learn("palm");
    return { ok: true, txt: "ท่านปะติดปะต่อหน้าที่หายไปได้ · เรียนรู้ ฝ่ามือมังกรคราม" };
  }

  // ---------- draw ----------
  function draw(ctx) {
    const A = G.art, p = R.p, t = R.t;
    if (S.mode !== "fight") {
      if (!A.cover(ctx, "bg/cave_meditation", W, H)) A.bgFallback(ctx, W, H, GROUND, t, true);
      for (let i = 0; i < 14; i++) {
        const ph = (t * 0.4 + i / 14) % 1;
        ctx.fillStyle = "rgba(143,200,255," + (0.6 * (1 - ph)) + ")";
        ctx.beginPath(); ctx.arc(W / 2 + Math.sin(i * 2.3 + t) * 40, GROUND - 20 - ph * 140, 2.5, 0, 7); ctx.fill();
      }
      if (!A.sprite(ctx, "hero/hero_meditate", W / 2, GROUND + 6, C.HERO_H * 0.9, 1)) A.heroFallback(ctx, W / 2, GROUND, 1, "meditate", t);
      ctx.font = "700 22px Charm, serif"; ctx.textAlign = "center"; ctx.fillStyle = "#efe7d4";
      ctx.fillText(S.mode === "meditate" ? "ปิดด่านฝึกตน" : "ศึกษา " + G.TECH[S.studyTech].n, W / 2, 40);
      drawFloats(ctx);
      return;
    }
    const mp = G.MAPS[S.map];
    const far = A.cover(ctx, "bg/r1_far", W, H);
    if (!far) A.bgFallback(ctx, W, H, GROUND, t, false);
    else { A.cover(ctx, "bg/r1_mid", W, H, true); A.cover(ctx, "bg/r1_ground", W, H, true); }
    if (mp.tint) { ctx.fillStyle = mp.tint; ctx.fillRect(0, 0, W, H); }
    for (const m of R.mons) if (m.alive) drawMon(ctx, m);
    drawHero(ctx);
    for (const f of R.fxs) {
      const a = 1 - f.t / f.dur;
      if (!A.fx(ctx, f.key, f.x, f.y, f.size, a, f.dir)) {
        if (f.key.includes("breakthrough")) { ctx.fillStyle = "rgba(255,230,160," + a * .6 + ")"; ctx.fillRect(f.x - 30, 0, 60, GROUND); }
        else A.slashFallback(ctx, f.x - f.dir * 20, f.y, f.dir, a, f.blue);
      }
    }
    ctx.font = "700 17px Charm, serif"; ctx.textAlign = "right";
    const tw = ctx.measureText(mp.n).width + 20; ctx.fillStyle = "rgba(13,15,19,.6)"; ctx.fillRect(W - tw - 6, H - 30, tw, 24);
    ctx.fillStyle = "#efe7d4"; ctx.fillText(mp.n, W - 16, H - 12);
    drawFloats(ctx);
  }
  function drawMon(ctx, m) {
    const d = G.MON[m.id], A = G.art;
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(m.x, GROUND + 2, d.h * 0.28, 5, 0, 0, 7); ctx.fill();
    const key = m.atkT > 0 && d.artAtk ? d.artAtk : d.art;
    const sy = 1 + Math.sin(m.bob) * 0.02;
    if (!A.sprite(ctx, key, m.x, GROUND + 2, d.h, m.dir, { flash: m.flash > 0, sy }))
      A.monFallback(ctx, d, m.x, GROUND, m.dir, m.bob, m.flash > 0);
    if (m.hp < d.hp) {
      const w = Math.max(36, d.h * 0.5), top = GROUND - d.h - 10;
      ctx.fillStyle = "#0b0c10"; ctx.fillRect(m.x - w / 2, top, w, 5);
      ctx.fillStyle = "#d4533f"; ctx.fillRect(m.x - w / 2, top, w * Math.max(0, m.hp) / d.hp, 5);
    }
    if (R.p.target === m) { const top = GROUND - d.h - 16; ctx.fillStyle = "#6cc4a1"; ctx.beginPath(); ctx.moveTo(m.x, top); ctx.lineTo(m.x - 5, top - 7); ctx.lineTo(m.x + 5, top - 7); ctx.fill(); }
  }
  function drawHero(ctx) {
    const p = R.p, A = G.art, t = R.t;
    let pose = p.poseT > 0 ? p.pose : R.ko > 0 ? "down" : p.hurtT > 0 ? "hurt" : p.moving ? (Math.floor(t * 7) % 2 ? "walk" : "idle") : "idle";
    ctx.save();
    if (injured() || R.ko > 0) ctx.globalAlpha = R.ko > 0 ? 0.6 : 0.85;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(p.x, GROUND + 2, 16, 4, 0, 0, 7); ctx.fill();
    if (p.shield > 0) {
      ctx.strokeStyle = "rgba(227,180,92,.8)"; ctx.lineWidth = 2; ctx.fillStyle = "rgba(227,180,92,.12)";
      ctx.beginPath(); ctx.ellipse(p.x, GROUND - 46, 38, 56, 0, 0, 7); ctx.fill(); ctx.stroke();
    }
    const sy = pose === "idle" ? 1 + Math.sin(t * 3) * 0.015 : 1;
    if (!A.sprite(ctx, "hero/hero_" + pose, p.x, GROUND + 2, C.HERO_H, p.dir, { sy }))
      A.heroFallback(ctx, p.x, GROUND, p.dir, pose, t, p.swing);
    ctx.restore();
    ctx.font = "600 12px Sarabun, sans-serif"; ctx.textAlign = "center";
    const tw = ctx.measureText(S.name).width + 10; ctx.fillStyle = "rgba(13,15,19,.65)"; ctx.fillRect(p.x - tw / 2, GROUND + 7, tw, 16);
    ctx.fillStyle = "#efe7d4"; ctx.fillText(S.name, p.x, GROUND + 19);
  }
  function drawFloats(ctx) {
    for (const f of R.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.3); ctx.fillStyle = f.col; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 3.5;
      ctx.font = "700 " + f.size + "px " + f.font + ", sans-serif"; ctx.textAlign = "center";
      ctx.strokeText(f.txt, f.x, f.y); ctx.fillText(f.txt, f.x, f.y); ctx.globalAlpha = 1;
    }
  }

  function tapWorld(x) {
    let hit = null;
    for (const m of R.mons) { const d = G.MON[m.id]; if (m.alive && Math.abs(m.x - x) < Math.max(24, d.h * 0.35)) hit = m; }
    if (hit) { R.p.target = hit; R.p.goalX = null; } else { R.p.target = null; R.p.goalX = x; }
  }

  return {
    get S() { return S; }, set S(v) { S = migrate(v); },
    R, fresh, st, expReq, tier, techMult, techCd, rates, qiRate, realmCap, breakReq, breakthrough,
    openNode, choosePath, learn, enterMap, tick, draw, offline, resolveCave, readManual, unlocked, injured,
    tapWorld, dmgTaken, setLog: f => { logFn = f; }
  };
})();
