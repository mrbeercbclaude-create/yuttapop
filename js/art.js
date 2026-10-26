// Art layer: draws Beer's ChatGPT PNGs from assets/ when present, procedural placeholders when not.
G.art = (() => {
  const cache = {};
  function load(key) {
    if (cache[key]) return cache[key];
    const rec = { ok: false, img: new Image(), box: null };
    rec.img.onload = () => { rec.box = trim(rec.img); rec.ok = true; };
    rec.img.onerror = () => { rec.missing = true; };
    rec.img.src = "assets/" + key + ".png";
    cache[key] = rec;
    return rec;
  }
  // Finds the opaque bounding box so generous AI margins don't shrink sprites.
  function trim(img) {
    const full = { x: 0, y: 0, w: img.width, h: img.height };
    try {
      const s = Math.min(1, 256 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
        if (d[(y * c.width + xx) * 4 + 3] > 24) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      if (maxX < 0) return full;
      return { x: minX / s, y: minY / s, w: (maxX - minX + 1) / s, h: (maxY - minY + 1) / s };
    } catch (e) { return full; }
  }
  // Bottom-centre anchored sprite of height h; images face right, dir<0 mirrors.
  function sprite(ctx, key, x, y, h, dir, o) {
    const r = load(key); if (!r.ok) return false;
    o = o || {};
    const b = r.box, w = b.w * h / b.h;
    ctx.save();
    ctx.translate(x, y);
    if (dir < 0) ctx.scale(-1, 1);
    if (o.sx || o.sy) ctx.scale(o.sx || 1, o.sy || 1);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.flash && "filter" in ctx) ctx.filter = "brightness(2.4)";
    ctx.drawImage(r.img, b.x, b.y, b.w, b.h, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }
  function cover(ctx, key, W, H, anchorBottom) {
    const r = load(key); if (!r.ok) return false;
    const s = Math.max(W / r.img.width, H / r.img.height), w = r.img.width * s, h = r.img.height * s;
    ctx.drawImage(r.img, (W - w) / 2, anchorBottom ? H - h : (H - h) / 2, w, h);
    return true;
  }
  // Effects are generated on black: screen blending drops the black.
  function fx(ctx, key, x, y, size, alpha, dir, rot) {
    const r = load(key); if (!r.ok) return false;
    ctx.save();
    ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = alpha;
    ctx.translate(x, y); if (dir < 0) ctx.scale(-1, 1); if (rot) ctx.rotate(rot);
    const s = size / Math.max(r.img.width, r.img.height);
    ctx.drawImage(r.img, -r.img.width * s / 2, -r.img.height * s / 2, r.img.width * s, r.img.height * s);
    ctx.restore();
    return true;
  }

  // ---------- placeholders ----------
  const SEED = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const ridges = [0, 1, 2].map(li => { const r = SEED(97 + li * 7), pts = []; let x = -40; while (x < 720) { pts.push([x, 0.25 + r() * 0.75]); x += 50 + r() * 70; } return pts; });
  function bgFallback(ctx, W, H, GROUND, t, cave) {
    if (cave) {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, W * 0.7);
      g.addColorStop(0, "#4b4436"); g.addColorStop(1, "#0f0e0c");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(170,200,230,.25)"; ctx.fillRect(W - 120, 40, 60, GROUND - 40);
      ctx.fillStyle = "#2a2620"; ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = "#5b4a30"; ctx.beginPath(); ctx.ellipse(W / 2, GROUND + 4, 70, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffcf7a"; ctx.beginPath(); ctx.arc(110, GROUND - 30 + Math.sin(t * 6) * 1.5, 5, 0, 7); ctx.fill();
      ctx.fillStyle = "#e9e1cf"; ctx.fillRect(107, GROUND - 26, 6, 26);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, "#e9dcc0"); g.addColorStop(1, "#f6efe0");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#d4533f"; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(500, 70, 26, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ["#b8b3a2", "#99a091", "#6f7d68"].forEach((col, li) => {
      const base = GROUND - 24 + li * 14, amp = 130 - li * 35;
      ctx.fillStyle = col; ctx.globalAlpha = 0.55 + li * 0.18; ctx.beginPath(); ctx.moveTo(0, H);
      for (const [x, h] of ridges[li]) ctx.lineTo(x, base - h * amp);
      ctx.lineTo(W, H); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#f6efe0"; ctx.fillRect(0, base - 14, W, 20);
    });
    ctx.globalAlpha = 1;
    for (const x of [12, 32, 600, 622]) {
      ctx.fillStyle = "#4f7a45"; ctx.fillRect(x, 30, 8, GROUND - 30);
      ctx.fillStyle = "#3a5d33"; for (let y = 60; y < GROUND; y += 40) ctx.fillRect(x - 1, y, 10, 3);
      ctx.fillStyle = "#5d8f4f"; for (let y = 50; y < 180; y += 44) { ctx.beginPath(); ctx.ellipse(x + 16, y + Math.sin(t + x) * 2, 13, 3.5, -.4, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = "#55644a"; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "rgba(0,0,0,.14)"; for (let x = 0; x < W; x += 30) ctx.fillRect(x, GROUND + 9 + (x % 3) * 6, 16, 3);
  }

  function eyes(ctx, x, y, dir, s, col) {
    for (const o of [-4, 4]) { ctx.fillStyle = col || "#1b1b28"; ctx.fillRect(x + o * s + dir * 2 * s - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s); }
  }
  // Hero placeholder in poses: idle walk attack1 attack2 skill palm hurt down meditate breakthrough
  function heroFallback(ctx, x, y, dir, pose, t, swing) {
    const s = 1.45;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const X = 0, Y = 0;
    if (pose === "meditate" || pose === "breakthrough") {
      ctx.fillStyle = "#dfe6ee"; ctx.beginPath(); ctx.ellipse(X, Y - 8, 20, 9, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(X - 9, Y - 38); ctx.lineTo(X + 9, Y - 38); ctx.lineTo(X + 12, Y - 10); ctx.lineTo(X - 12, Y - 10); ctx.fill();
      ctx.fillStyle = "#4c6fa8"; ctx.fillRect(X - 10, Y - 24, 20, 3);
      ctx.fillStyle = "#efd2b0"; ctx.beginPath(); ctx.arc(X, Y - 46, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "#16120f"; ctx.beginPath(); ctx.arc(X, Y - 49, 9, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.arc(X, Y - 59, 4, 0, 7); ctx.fill();
      ctx.fillRect(X - 5, Y - 46, 3, 1.2); ctx.fillRect(X + 2, Y - 46, 3, 1.2);
      ctx.restore(); return;
    }
    const walk = pose === "walk" ? Math.sin(t * 12) * 4 : 0;
    const down = pose === "down";
    if (down) ctx.translate(0, 8);
    ctx.fillStyle = "#1e1e24"; ctx.fillRect(X - 7, Y - 14, 5, 14 + (walk > 0 ? -walk / 2 : 0)); ctx.fillRect(X + 2, Y - 14, 5, 14 + (walk < 0 ? walk / 2 : 0));
    const lean = pose === "attack2" ? 5 * dir : pose === "hurt" ? -4 * dir : 0;
    ctx.fillStyle = "#dfe6ee"; ctx.beginPath(); ctx.moveTo(X - 9 + lean, Y - 40); ctx.lineTo(X + 9 + lean, Y - 40); ctx.lineTo(X + 13, Y - 8); ctx.lineTo(X - 13, Y - 8); ctx.fill();
    ctx.fillStyle = "#4c6fa8"; ctx.fillRect(X - 10, Y - 28, 20, 4);
    ctx.fillStyle = "#efd2b0"; ctx.beginPath(); ctx.arc(X + lean, Y - 48, 10, 0, 7); ctx.fill();
    ctx.fillStyle = "#16120f"; ctx.beginPath(); ctx.arc(X + lean, Y - 51, 10, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(X + lean - dir * 2, Y - 62, 4.5, 0, 7); ctx.fill();
    ctx.fillRect(X + lean + dir * 4 - 1, Y - 49, 3, 2.5);
    ctx.lineCap = "round";
    if (pose === "palm") {
      ctx.fillStyle = "#efd2b0"; ctx.beginPath(); ctx.arc(X + dir * 24, Y - 32, 5, 0, 7); ctx.fill();
    } else {
      const ang = pose === "attack2" ? (dir > 0 ? 0 : Math.PI) : pose === "skill" ? -Math.PI / 2 : (dir > 0 ? -1.2 : Math.PI + 1.2) + dir * (swing || 0) * 2.4;
      ctx.strokeStyle = "#c9ced6"; ctx.lineWidth = 3; ctx.beginPath();
      const ox = pose === "skill" ? X : X + dir * 9, oy = pose === "skill" ? Y - 56 : Y - 30;
      ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(ang) * 30, oy + Math.sin(ang) * 30); ctx.stroke();
    }
    ctx.restore();
  }
  function monFallback(ctx, d, x, y, dir, bob, flash) {
    const s = (d.h || 80) / 80, col = flash ? "#ffffff" : d.col;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); x = 0; y = 0;
    if (d.shape === "human") {
      const b = Math.sin(bob) * 1.5;
      ctx.fillStyle = "#2d2a28"; ctx.fillRect(x - 7, y - 14, 5, 14); ctx.fillRect(x + 2, y - 14, 5, 14);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 10, y - 40 + b); ctx.lineTo(x + 10, y - 40 + b); ctx.lineTo(x + 14, y - 10); ctx.lineTo(x - 14, y - 10); ctx.fill();
      ctx.fillStyle = "#e7c9a5"; ctx.beginPath(); ctx.arc(x, y - 49 + b, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "#2b2219"; ctx.beginPath(); ctx.arc(x, y - 52 + b, 9, Math.PI, 0); ctx.fill();
      ctx.fillStyle = d.band || "#c0392b"; ctx.fillRect(x - 9, y - 53 + b, 18, 3); eyes(ctx, x, y - 49 + b, dir, .8);
      ctx.strokeStyle = d.boss ? "#9aa1ab" : "#6b4a2b"; ctx.lineWidth = d.club ? 5 : 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x + dir * 10, y - 28); ctx.lineTo(x + dir * 24, y - 46 + Math.sin(bob) * 3); ctx.stroke();
    } else if (d.shape === "snake") {
      ctx.lineWidth = 9; ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const px = x - dir * (i * 6), py = y - 6 - Math.sin(bob + i) * 4; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + dir * 4, y - 16, 9, 0, 7); ctx.fill();
      eyes(ctx, x + dir * 5, y - 18, dir, .7, "#f2d24b");
    } else {
      const run = Math.sin(bob * 1.5) * 4;
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = "round";
      for (const o of [-12, -5, 6, 13]) { ctx.beginPath(); ctx.moveTo(x + o, y - 12); ctx.lineTo(x + o + (o % 2 ? run : -run) * .5, y); ctx.stroke(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y - 17, 20, 9, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + dir * 20, y - 24, 8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + dir * 16, y - 30); ctx.lineTo(x + dir * 18, y - 38); ctx.lineTo(x + dir * 22, y - 31); ctx.fill();
      if (d.shape === "boar") { ctx.fillStyle = "#e8e2d4"; ctx.beginPath(); ctx.moveTo(x + dir * 26, y - 22); ctx.lineTo(x + dir * 32, y - 30); ctx.lineTo(x + dir * 28, y - 20); ctx.fill(); }
      eyes(ctx, x + dir * 23, y - 25, dir, .7);
    }
    ctx.restore();
  }
  function slashFallback(ctx, x, y, dir, a, blue) {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = blue ? "#8fc8ff" : "#ffffff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 34, dir > 0 ? -1.3 : Math.PI - .4, dir > 0 ? .4 : Math.PI + 1.3); ctx.stroke(); ctx.restore();
  }
  // Preload everything the game might draw so first frames don't pop.
  function preload(keys) { keys.forEach(load); }
  return { load, sprite, cover, fx, bgFallback, heroFallback, monFallback, slashFallback, preload };
})();
