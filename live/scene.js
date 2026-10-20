// live/scene.js — EMBER KEEP scene. Pure function of t and the sim state (ref2game scene contract).
// Layers: tiled moss ground → contact shadows → Y-sorted pines, rocks, grass, logs, campfire, hero → NIGHT pass (darkness with
// a hole of firelight whose radius is the fire's fuel, plus the hero's small lantern) → fire, sparks, glows → wisps (they glow in
// the dark, so they read outside the light) → event FX → grade → HUD.
(function () {
  const S = (window.SCENE = {}), L = LIB, M = L.M, W = SIM.VIEW.W, H = SIM.VIEW.H, F = SIM.FIRE;
  S.REPEAT = ['ground_tex'];
  const NIGHT = `uniform vec2 u_fire; uniform float u_R; uniform vec2 u_hero; uniform float u_hr; uniform float u_dark;
void main(){ vec2 d = v_px - u_fire; d.y *= 1.25; float df = length(d); vec2 e = v_px - u_hero; e.y *= 1.2; float dh = length(e);
  float lit = max(smoothstep(u_R, u_R * 0.45, df), 0.55 * smoothstep(u_hr, u_hr * 0.25, dh));
  float n = vnoise(v_px * 0.012 + u_t * 0.15) * 0.08;
  float a = clamp(u_dark * (1.0 - lit) + n * (1.0 - lit), 0.0, 0.97);
  vec3 c = vec3(0.01, 0.03, 0.07); o = vec4(c * a, a); }`;
  // the firewood log is the one prop drawn in code: 6 generations of it all came back with a tree attached
  const logCanvas = () => { const c = document.createElement('canvas'); c.width = 240; c.height = 120; const g = c.getContext('2d');
    g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = '#1d140c';
    const body = g.createLinearGradient(0, 22, 0, 100); body.addColorStop(0, '#9a6a3c'); body.addColorStop(0.45, '#6e4524'); body.addColorStop(1, '#3d2513');
    g.beginPath(); g.moveTo(40, 22); g.lineTo(196, 22); g.ellipse(196, 61, 22, 39, 0, -Math.PI / 2, Math.PI / 2); g.lineTo(40, 100); g.ellipse(40, 61, 22, 39, 0, Math.PI / 2, Math.PI * 1.5); g.closePath();
    g.fillStyle = body; g.fill(); g.stroke();
    g.strokeStyle = 'rgba(30,18,8,0.55)'; g.lineWidth = 3; for (const y of [40, 58, 80]) { g.beginPath(); g.moveTo(70, y); g.bezierCurveTo(110, y - 5, 150, y + 5, 185, y); g.stroke(); }
    const end = g.createRadialGradient(40, 61, 4, 40, 61, 38); end.addColorStop(0, '#f2cf8e'); end.addColorStop(1, '#c58a4a');
    g.beginPath(); g.ellipse(40, 61, 20, 36, 0, 0, Math.PI * 2); g.fillStyle = end; g.fill(); g.lineWidth = 6; g.strokeStyle = '#1d140c'; g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(120,70,30,0.7)'; for (const r of [0.35, 0.65]) { g.beginPath(); g.ellipse(40, 61, 20 * r, 36 * r, 0, 0, Math.PI * 2); g.stroke(); }
    return c; };
  S.programs = () => { L.init(W, H, { night: NIGHT }); L.glyphs('0123456789×+/:.s'); L.SUN = [W * 0.2, -400]; G.canvasTex('log', logCanvas()); };
  const INK = [0.05, 0.07, 0.05], DUST = [0.42, 0.40, 0.32], EMBER = [1.0, 0.55, 0.18], CYAN = [0.45, 0.95, 1.0];
  const SZ = { hero: 74, pine: 210, rock: 64, tuft: 40, log: 50, fire: 128, wisp: 62 };

  S.render = (t) => {
    const ST = S.state || SIM.at(t), GT = ST.t, rnd = L.rnd, attract = !S.state;
    // ---- trauma shake from events (quadratic falloff, sines, never random) ----
    let tr = 0; for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue;
      const k = { hurt: [1.0, 0.45], snuff: [0.55, 0.4], feed: [0.35, 0.3], pop: [0.28, 0.2], over: [0.9, 0.6] }[e.k]; if (k && a < k[1]) tr = Math.max(tr, k[0] * (1 - a / k[1])); }
    const shk = 16 * tr * tr, cx = ST.cam[0] + shk * Math.sin(GT * 91), cy = ST.cam[1] + shk * Math.sin(GT * 117 + 1);
    const sx = (x) => x - cx, sy = (y) => y - cy;
    const fl = 1 + 0.035 * Math.sin(GT * 13.1) + 0.025 * Math.sin(GT * 29.7 + 1.3);       // fire flicker
    const out = ST.fuel <= 0, R = (out ? 40 : SIM.lightR(ST.fuel)) * fl, fx = sx(F.x), fy = sy(F.y);   // out: the light collapses

    // ===== ground =====
    L.beginBG([0.05, 0.07, 0.05, 1]);
    { const T = 420; L.sprite('ground_tex', 0, 0, { w: W, h: H, src: [cx / T, cy / T, (cx + W) / T, (cy + H) / T], u: { grade: [0.85, 0.75, 0, 1.05] } }); }
    // (fbm fog mottling removed for speed: 43.6 -> 51.9 fps headless on a CPU renderer)
    L.beginComp();
    // warm light pooled on the ground around the fire (under the sprites)
    if (!out) L.glow(fx, fy, R * 1.05, [1.0, 0.55, 0.22], 0.30 * fl, 2.2);

    // ===== Y-sorted world =====
    for (const [x, y, s] of SIM.TREES) L.shadow(sx(x) + 20 * s, sy(y) + 4, 54 * s, 18 * s, 0.45);
    for (const [x, y, s] of SIM.ROCKS) L.shadow(sx(x) + 8, sy(y) + 2, 40 * s, 12 * s, 0.45);
    const Y = [], vis = (x, y, m = 260) => sx(x) > -m && sx(x) < W + m && sy(y) > -m && sy(y) < H + m * 1.6;
    SIM.TREES.forEach(([x, y, s], i) => { if (!vis(x, y)) return; Y.push([y, () => { const h = SZ.pine * s, w = L.hsz('pine', h);
      L.sprite('pine', sx(x) - w / 2, sy(y) - h * 0.97, { h, pad: 0.04, u: { sway: [0.004, 3, L.ph(t, 4.1, i), 1], grade: [0.9, 0.9, 0, 1] } }); }]); });
    SIM.ROCKS.forEach(([x, y, s]) => { if (!vis(x, y)) return; Y.push([y, () => { const h = SZ.rock * s, w = L.hsz('rock', h); L.sprite('rock', sx(x) - w / 2, sy(y) - h * 0.92, { h }); }]); });
    SIM.TUFTS.forEach(([x, y, , th], i) => { if (!vis(x, y, 80)) return; Y.push([y, () => { const f = ST.tf[i], w = L.hsz('tuft_0', th), lean = Math.max(-0.3, Math.min(0.3, f[0] / w)), hh = th * (1 - 0.4 * f[3]);
      L.sprite('tuft_0', sx(x) - w / 2, sy(y) - hh, { w, h: hh, pad: 0.3, flip: rnd(i, 3) > 0.5, u: { lean: [lean, 0], sway: [0.006, 5, t * 2 + 6.28 * rnd(i, 11), 1], vfade: 0.15 } }); }]); });
    ST.logs.forEach((g) => { if (!vis(g.x, g.y)) return; Y.push([g.y, () => { const age = GT - g.t0, pop = Math.min(1, age / 0.35), b = 3 * Math.sin(t * 3 + g.id);
      const w = SZ.log * (0.6 + 0.4 * pop), h = w * G.tex('log').h / G.tex('log').w;
      L.shadow(sx(g.x), sy(g.y) + 2, 22, 7, 0.45); L.glow(sx(g.x), sy(g.y) - 10, 44, [1, 0.75, 0.35], 0.18 + 0.06 * Math.sin(t * 4 + g.id), 3.5);
      L.sprite('log', sx(g.x) - w / 2, sy(g.y) - h - b, { w, h }); }]); });
    Y.push([F.y, () => { const w = SZ.fire, h = L.hsz('campfire', 1) ? w / L.hsz('campfire', 1) : w; L.sprite('campfire', fx - w / 2, fy - h * 0.6, { w, h, u: { tint: [1.0, 0.62, 0.35, 0.35] } }); }]);
    // hero (template mover look: bob + lean + stepping feet; carried logs stack on the back)
    Y.push([ST.y, () => { const sp = Math.hypot(ST.vx, ST.vy), run = Math.min(1, sp / 180), ph = ST.dist / 60 * Math.PI, dash = GT - ST.dashT < 0.17;
      const bob = run * 5 * Math.abs(Math.sin(ph)), q = 1 + 0.05 * run * Math.cos(2 * ph) + (dash ? -0.12 : 0), lean = ST.vx * 0.0006 + (dash ? 0.12 * Math.sign(ST.vx || 1) : 0);
      const hx = sx(ST.x), hy = sy(ST.y), hurt = GT - ST.hurtT < SIM.K.IFRAME, blink = hurt && Math.floor(GT * 14) % 2 === 0;
      L.shadow(hx, hy, 24, 8, 0.5);
      const draw = () => { for (const side of [-1, 1]) { const st = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * run; L.shadow(hx + side * 9 + st * 6 * ST.faceX, hy - 2 - Math.max(0, st) * 4, 7, 5, L.sp ? 0 : 0.9); }
        const h = SZ.hero, w = L.hsz('hero_top', h);
        L.sprite('hero_top', 0, 0, { m: M.of(M.t(hx, hy - 4 - bob), M.r(lean), M.s(ST.faceX / Math.sqrt(q), q)), w, h, pivot: [w / 2, h], u: { alpha: blink ? 0.35 : 1, rim: [0.45, ST.faceX > 0 ? 0.004 : -0.004, -0.004, 1], rimCol: [1, 0.7, 0.4] } });
        for (let j = 0; j < ST.carry; j++) { const lw = 40, lh = lw * G.tex('log').h / G.tex('log').w; L.sprite('log', hx - lw / 2 + (j - 1) * 4, hy - SZ.hero - 6 - bob - j * 13 - lh * 0.5, { w: lw, h: lh, rot: 0.15 * (j - 1) }); } };
      L.inked(draw, { r: 1.6, col: INK }); }]);
    Y.sort((a, b) => a[0] - b[0]).forEach(([, d]) => d());

    // ===== night =====
    if (!L.NOFX) { G.draw(L.P.night, { u_t: t, u_fire: [fx, fy], u_R: R, u_hero: [sx(ST.x), sy(ST.y) - 30], u_hr: 170, u_dark: 0.74 }, G.xf(0, 0, W, H)); }
    // ===== fire: flame tongues and sparks (code, never baked) =====
    const life = out ? 0 : Math.min(1, ST.fuel / 60) * 0.7 + 0.3;
    L.shadow(fx, fy - 6, 36, 20, 0.85); L.glow(fx, fy - 6, 46, [1.0, 0.32, 0.08], out ? 0.25 : 0.9, 2.2);           // ember bed
    if (!out) L.glow(fx, fy - 22, 120 * fl * life + 30, [1.0, 0.5, 0.15], 0.55, 2.6);
    if (out) for (let j = 0; j < 6; j++) { const s = rnd(j, 21), a = ((t * 0.5 + s) % 1); L.puff(fx + (s - 0.5) * 30 + 20 * a, fy - 20 - 140 * a, 14 + 30 * a, [0.3, 0.32, 0.36], 0.5 * (1 - a), j + Math.floor(t * 0.5 + s)); }
    G.blend('add');
    for (let j = 0; j < 22; j++) { const s = rnd(j, 7), per = 0.5 + 0.35 * s, a = ((t + s * 3) % per) / per;
      const x = fx + (s - 0.5) * 46 * (1 - a) + 6 * Math.sin(t * 7 + j), y = fy - 18 - a * (70 + 50 * life) * (0.7 + 0.5 * s);
      L.puff(x, y, (20 + 18 * s) * (1 - a * 0.7) * life, a < 0.4 ? [1, 0.85, 0.4] : [1, 0.42, 0.12], 0.75 * (1 - a), j + Math.floor((t + s * 3) / per)); }
    G.blend();
    for (let j = 0; j < 10; j++) { const s = rnd(j, 9), per = 1.4 + s, a = ((t * 0.9 + s * 5) % per) / per;
      L.star(fx + (s - 0.5) * 60 + 30 * Math.sin(a * 6 + j), fy - 30 - a * 220 * life, 5 + 3 * s, EMBER, (1 - a) * 0.9); }
    for (const g of ST.logs) { if (!vis(g.x, g.y)) continue; const p = 0.5 + 0.5 * Math.sin(t * 4 + g.id);
      L.glow(sx(g.x), sy(g.y) - 8, 40, [1, 0.7, 0.3], 0.22 + 0.12 * p, 3.2); L.star(sx(g.x), sy(g.y) - 30 - 4 * p, 9, [1, 0.85, 0.5], 0.5 + 0.4 * p); }
    // ===== wisps (glow in the dark) =====
    for (const w of ST.wisps) { if (!vis(w.x, w.y, 120)) continue; const age = GT - w.t0, inn = Math.min(1, age / 0.6), b = 6 * Math.sin(t * 4 + w.ph);
      const df = Math.hypot(F.x - w.x, (F.y - w.y) * 1.25), burnt = df < R ? 0.55 : 1, x = sx(w.x), y = sy(w.y) - 34 + b;
      L.glow(x, y, 70, CYAN, 0.35 * inn * burnt, 3); L.shadow(sx(w.x), sy(w.y) + 4, 16, 5, 0.3 * inn);
      const h = SZ.wisp, ww = L.hsz('wisp', h);
      L.sprite('wisp', 0, 0, { m: M.of(M.t(x, y), M.s((w.vx < 0 ? -1 : 1) * (1 + 0.05 * Math.sin(t * 6 + w.ph)), 1 - 0.05 * Math.sin(t * 6 + w.ph))), w: ww, h, pivot: [ww / 2, h / 2], u: { alpha: inn * (0.6 + 0.4 * burnt) } }); }
    // ===== event FX =====
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue; const ex = sx(e.x), ey = sy(e.y);
      if (e.k === 'step' && a < 0.35) { const q = a / 0.35; L.puff(ex, ey - 3 - 8 * q, 5 + 7 * q, DUST, 0.35 * (1 - q), e.t * 10); }
      if (e.k === 'dash' && a < 0.45) for (let j = 0; j < 7; j++) { const q = a / 0.45, s = rnd(e.t, j);
        L.puff(ex - e.dx * (14 + 80 * q * s) + (s - 0.5) * 20, ey - e.dy * (14 + 80 * q * s) - 6, 6 + 12 * q, DUST, 0.5 * (1 - q), e.t + j); }
      if (e.k === 'dash' && a < 0.2) { const q = a / 0.2; L.ring(ex, ey - 30, 20 + 50 * q, 14 + 34 * q, [0.9, 0.95, 1], 0.6 * (1 - q), 0.15); }
      if (e.k === 'pick' && a < 0.5) { const q = a / 0.5; for (let j = 0; j < 6; j++) { const an = j * 1.047 + e.t, d = 10 + 40 * (1 - (1 - q) ** 2); L.star(ex + Math.cos(an) * d, ey - 14 + Math.sin(an) * d * 0.7, 9, [1, 0.85, 0.5], 1 - q); } }
      if (e.k === 'feed' && a < 0.9) { const q = a / 0.9; L.ring(ex, ey + 20, 40 + 200 * q, 30 + 150 * q, [1, 0.7, 0.3], 1 - q, 0.12);
        L.glow(ex, ey, 160 + 80 * e.n, [1, 0.6, 0.2], 0.6 * (1 - q), 2.4);
        for (let j = 0; j < 10 + 6 * e.n; j++) { const s = rnd(e.t, j), an = s * 6.283, d = (60 + 160 * s) * Math.sqrt(q); L.star(ex + Math.cos(an) * d, ey - 30 + Math.sin(an) * d * 0.6 - 80 * q, 8, EMBER, 1 - q); } }
      if (e.k === 'feed' && a < 1.1) { const q = a / 1.1; L.text('+' + e.pts, ex, ey - 70 - 60 * q, 46 + 8 * e.n, 0.5, Math.min(1, 3 * (1 - q))); }
      if (e.k === 'pop' && a < 0.6) { const q = a / 0.6; L.ring(ex, ey, 18 + 70 * q, 14 + 56 * q, CYAN, 1 - q, 0.12); L.glow(ex, ey, 90, CYAN, 0.6 * (1 - q), 3);
        for (let j = 0; j < 8; j++) { const an = j * 0.785 + e.t, d = 14 + 70 * (1 - (1 - q) ** 2); L.star(ex + Math.cos(an) * d, ey + Math.sin(an) * d, 10, CYAN, 1 - q); }
        if (a < 0.8) L.text('+5', ex, ey - 40 - 40 * q, 34, 0.5, 1 - q); }
      if (e.k === 'snuff' && a < 1.2) { const q = a / 1.2; for (let j = 0; j < 6; j++) { const s = rnd(e.t, j); L.puff(ex + (s - 0.5) * 70, ey - 20 - 120 * q * (0.6 + s), 18 + 30 * q, [0.25, 0.27, 0.3], 0.55 * (1 - q), e.t + j); }
        if (a < 0.3) L.ring(ex, ey + 20, 30 + 120 * a / 0.3, 22 + 90 * a / 0.3, CYAN, 0.8 * (1 - a / 0.3), 0.1); }
      if (e.k === 'hurt' && a < 0.5) { const q = a / 0.5; L.ring(ex, ey, 20 + 80 * q, 20 + 80 * q, [1, 0.35, 0.3], 1 - q, 0.15); }
    }
    L.finish(t, { bloom: [0.30, 0.26], vignette: 0.85, warm: 1.1 });

    // ===== HUD (screen space, after the grade) =====
    if (attract) { const a = 0.85 + 0.15 * Math.sin(t * 2);
      L.uiBox('title', W / 2 - 250, 40, 500, 120, 8); L.shadow(W / 2, 100, 280, 70, 0.5);
      L.label('title', 'EMBER KEEP', W / 2, 88, { size: 64, al: 0.5, col: '#ffd39a', out: '#2a1006' });
      L.label('sub', 'press any key to play', W / 2, 140, { size: 24, al: 0.5, a, col: '#e8eef5', out: '#0a1018' });
      return; }
    // fuel bar
    const fw = 300, fh = 22, fx0 = 28, fy0 = 26, fr = ST.fuel / 100, low = ST.fuel < 25 && Math.floor(GT * 4) % 2 === 0;
    L.uiBox('fuel', fx0 - 10, fy0 - 10, fw + 20 + 60, fh + 46, 4);
    L.rrect(fx0 - 4, fy0 - 4, fw + 8, fh + 8, 9, [0.05, 0.04, 0.03], [0.05, 0.04, 0.03], 0.8);
    L.rrect(fx0, fy0, Math.max(fh, fw * fr), fh, 7, low ? [1, 0.25, 0.15] : [1, 0.78, 0.3], low ? [0.7, 0.1, 0.05] : [0.95, 0.38, 0.1]);
    L.label('fuelL', 'FIRE', fx0 + fw + 14, fy0 + fh / 2, { size: 20, col: '#ffd39a' });
    // hearts
    for (let i = 0; i < SIM.K.HEARTS; i++) L.label('h' + i, '♥', fx0 + i * 30, fy0 + fh + 22, { size: 26, col: i < ST.hearts ? '#ff5a5a' : '#3a3030', out: '#200' });
    // carry
    for (let i = 0; i < SIM.K.CARRY; i++) { const lw = 34, lh = lw * G.tex('log').h / G.tex('log').w; L.sprite('log', fx0 + 110 + i * 38, fy0 + fh + 22 - lh / 2, { w: lw, h: lh, u: { alpha: i < ST.carry ? 1 : 0.22 } }); }
    // score + time
    L.uiBox('score', W - 260, 14, 240, 100, 4); L.text(String(ST.score), W - 30, 48, 52, 1); L.text((ST.over && ST.tEnd !== undefined ? ST.tEnd : ST.t).toFixed(1) + 's', W - 30, 92, 30, 1, 0.85);
    if (ST.over) { const q = Math.min(1, ST.overT / 0.5), sline = `score ${ST.score}   ·   ${(ST.tEnd || ST.t).toFixed(1)} s   ·   ${ST.delivered} logs   ·   ${ST.pops} wisps`;
      const pw = Math.max(520, L.labelW('ovS', sline, { size: 24 }) + 70), ph = 250, px = W / 2 - pw / 2, py = H / 2 - ph / 2;   // sized to content (qa.mjs caught the overflow)
      L.uiBox('over', px, py, pw, ph, 10); L.rrect(px, py, pw, ph, 22, [0.06, 0.05, 0.07], [0.02, 0.02, 0.03], 0.88 * q);
      L.label('ovT', ST.over === 'out' ? 'THE FIRE WENT OUT' : 'THE WISPS GOT YOU', W / 2, py + 52, { size: 42, al: 0.5, a: q, col: '#ffd39a', out: '#2a1006' });
      L.label('ovS', sline, W / 2, py + 112, { size: 24, al: 0.5, a: q, col: '#e8eef5', out: '#0a1018' });
      L.label('ovB', `best ${Math.max(ST.best, ST.score)}`, W / 2, py + 152, { size: 24, al: 0.5, a: q, col: '#9fe8ff', out: '#0a1018' });
      L.label('ovR', 'press R to play again', W / 2, py + 205, { size: 26, al: 0.5, a: q * (0.75 + 0.25 * Math.sin(GT * 4)), col: '#ffffff', out: '#0a1018' }); }
  };
  // QA hooks (engine.md §7): every HUD screen with worst-case values
  S.QA = () => {
    const base = (o = {}) => { const s = SIM.spawn(0); for (let i = 0; i < 120; i++) SIM.step(s, {}); return Object.assign(s, o); };
    return { states: [['start', base()], ['carry3', base({ carry: 3, score: 99990, fuel: 100 })], ['lowfuel', base({ fuel: 8, hearts: 1, score: 1234 })],
      ['over_out', base({ over: 'out', overT: 1, score: 99990, delivered: 999, pops: 999, best: 99990, t: 999.9, tEnd: 999.9 })],
      ['over_caught', base({ over: 'caught', overT: 1, score: 99990, delivered: 999, pops: 999, best: 99990, hearts: 0 })]],
      cycles: {}, sprites: {}, box: () => [0, 0, W, H] };
  };
})();
