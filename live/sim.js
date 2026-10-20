// live/sim.js — EMBER KEEP. Deterministic top-down sim, fixed 120 Hz (ref2game sim contract: create / step / at / spawn /
// respawn / outOfPlay / scriptInput, events in S.ev). Keep the campfire alive: carry logs from the dark woods to the fire,
// dash through the ghost wisps that come to snuff it. The fire's light is its shield: wisps crawl inside it.
(function (root) {
  const DT = 1 / 120, L = 40.0;
  const VIEW = { W: 1280, H: 720 }, WORLD = { x0: 0, y0: 0, x1: 2200, y1: 1400 };
  const FIRE = { x: 1100, y: 700 };
  const K = { RUN: 260, ACC: 1900, DEC: 2300, DASH: 760, DASH_T: 0.17, DASH_CD: 0.55, R: 18, CARRY: 3, LOG_FUEL: 13,
    FUEL0: 70, BURN0: 2.0, BURN_K: 0.045, SNUFF: 14, HEARTS: 3, IFRAME: 1.3, MAXLOGS: 7 };
  const HINT = 'WASD / arrows move · Space dash (through wisps) · carry logs to the fire · R restart';
  const hh = (a, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

  // ---------------- level data (y = ground contact point; draw order = y) ----------------
  const TREES = []; for (let i = 0; i < 70; i++) { const a = hh(i, 1) * 6.283, d = 520 + 700 * hh(i, 2);
    const x = FIRE.x + Math.cos(a) * d * 1.25, y = FIRE.y + Math.sin(a) * d * 0.8;
    if (x > 60 && x < WORLD.x1 - 60 && y > 80 && y < WORLD.y1 - 20) TREES.push([Math.round(x), Math.round(y), 0.8 + 0.5 * hh(i, 3)]); }
  const ROCKS = [[820, 520, 0.9], [1420, 880, 1.0], [700, 980, 0.8], [1560, 430, 0.85], [1900, 1000, 1.0], [300, 400, 0.9]];
  const SOLIDS = [...TREES.map(([x, y, s]) => ({ x, y: y - 4, r: 20 * s })), ...ROCKS.map(([x, y, s]) => ({ x, y: y - 6, r: 34 * s })), { x: FIRE.x, y: FIRE.y, r: 44 }];
  const TUFTS = []; for (let i = 0; i < 60; i++) TUFTS.push([Math.round(120 + hh(i, 4) * 1960), Math.round(120 + hh(i, 5) * 1200), 0, 34 + 22 * hh(i, 6)]);
  const free = (x, y, pad = 30) => SOLIDS.every((o) => Math.hypot(x - o.x, (y - o.y) * 1.4) > o.r + pad) && x > 80 && x < WORLD.x1 - 80 && y > 120 && y < WORLD.y1 - 60;
  const logSpot = (n) => { for (let k = 0; k < 40; k++) { const a = hh(n, 10 + k) * 6.283, d = 260 + 560 * hh(n, 60 + k);
    const x = FIRE.x + Math.cos(a) * d * 1.3, y = FIRE.y + Math.sin(a) * d * 0.85; if (free(x, y)) return [x, y]; } return [FIRE.x + 300, FIRE.y]; };

  const burn = (t) => K.BURN0 + K.BURN_K * t;                                  // fuel / s, rises with time
  const lightR = (fuel) => 120 + 3.3 * fuel;                                   // light radius (px) from fuel 0..100
  const spawnGap = (t) => Math.max(0.75, 3.2 - 0.065 * t);                     // seconds between wisps
  const wispV = (t) => Math.min(175, 72 + 1.6 * t);

  function create() {
    const S = { t: 0, steps: 0, wt0: 0, x: FIRE.x + 120, y: FIRE.y + 60, vx: 0, vy: 0, faceX: 1, faceY: 1, dist: 0, dashT: -9, dashCD: 0, prevAct: 0,
      hurtT: -9, hearts: K.HEARTS, fuel: K.FUEL0, carry: 0, score: 0, pops: 0, delivered: 0, best: 0, over: null, overT: 0,
      logs: [], logN: 0, wisps: [], wispN: 0, nextWisp: 2.5, freeze: 0, ev: [], cam: [0, 0], camV: [0, 0], tf: TUFTS.map(() => [0, 0, -9, 0]) };
    for (let i = 0; i < 5; i++) addLog(S);
    S.cam = [S.x - VIEW.W / 2, S.y - VIEW.H / 2]; clampCam(S.cam); return S;
  }
  function addLog(S) { const [x, y] = logSpot(S.logN++); S.logs.push({ x, y, id: S.logN, t0: S.t }); }
  const clampCam = (c) => { c[0] = Math.max(WORLD.x0, Math.min(WORLD.x1 - VIEW.W, c[0])); c[1] = Math.max(WORLD.y0, Math.min(WORLD.y1 - VIEW.H, c[1])); };
  const spawn = (worldT) => Object.assign(create(), { wt0: worldT });
  const respawn = (S, worldT) => Object.assign(spawn(worldT), { best: Math.max(S.best || 0, S.score) });
  const outOfPlay = () => false;

  function step(S, inp) {
    if (inp && inp.auto) inp = scriptInput(S.t, S);
    const t = S.t + DT, wt = S.wt0 + t;
    if (S.over) { S.t = t; S.steps++; S.overT += DT; return S; }
    // ---- grass leans away from the hero and the wisps' wake ----
    TUFTS.forEach(([tx, ty, , th], i) => { const f = S.tf[i]; let tg = 3 * Math.sin(0.9 * wt + tx * 0.01) * th / 100, flat = 0;
      const dx = tx - S.x, dy = (ty - S.y) * 1.6, d = Math.hypot(dx, dy);
      if (d < 70) { const w = 1 - Math.max(0, Math.min(1, (d - 10) / 60)); tg += Math.sign(dx || 1) * 0.3 * th * w; flat = d < 30 ? 1 : 0;
        if (w > 0.6 && Math.hypot(S.vx, S.vy) > 100 && t - f[2] > 0.5) { f[2] = t; S.ev.push({ k: 'rustle', t, x: tx, y: ty - th * 0.5, d: Math.sign(S.vx || 1) }); } }
      f[1] += (355 * (tg - f[0]) - 11 * f[1]) * DT; f[0] += f[1] * DT; f[3] += (flat - f[3]) * Math.min(1, (flat > f[3] ? 14 : 2.5) * DT); });
    // ---- the fire burns down; logs regrow in the woods ----
    S.fuel = Math.max(0, S.fuel - burn(t) * DT);
    if (S.logs.length < K.MAXLOGS && Math.floor(t / 2.2) !== Math.floor(S.t / 2.2)) addLog(S);
    // ---- wisps: spawn in the dark at the world edge, drift to the fire (or hunt a hero who carries wood) ----
    if (t >= S.nextWisp) { const n = S.wispN++, a = hh(n, 200) * 6.283;
      const x = FIRE.x + Math.cos(a) * 1300, y = FIRE.y + Math.sin(a) * 820;
      S.wisps.push({ id: n, x: Math.max(-40, Math.min(WORLD.x1 + 40, x)), y: Math.max(-40, Math.min(WORLD.y1 + 40, y)), vx: 0, vy: 0, t0: t, ph: hh(n, 201) * 6.28 });
      S.nextWisp = t + spawnGap(t) * (0.75 + 0.5 * hh(n, 202)); }
    const R = lightR(S.fuel), dashing = t - S.dashT < K.DASH_T;
    for (let i = S.wisps.length - 1; i >= 0; i--) { const w = S.wisps[i];
      const dh = Math.hypot(S.x - w.x, S.y - w.y), df = Math.hypot(FIRE.x - w.x, (FIRE.y - w.y) * 1.25);
      const hunt = S.carry > 0 && dh < 300, tx = hunt ? S.x : FIRE.x, ty = hunt ? S.y - 20 : FIRE.y - 10;
      const inLight = df < R ? 0.42 : 1, v = wispV(t) * inLight * (hunt ? 1.15 : 1);
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy) || 1;
      const wob = 0.6 * Math.sin(2.3 * t + w.ph);                                // weave, so they are not straight lines
      const ux = dx / d * Math.cos(wob) - dy / d * Math.sin(wob), uy = dx / d * Math.sin(wob) + dy / d * Math.cos(wob);
      w.vx += (ux * v - w.vx) * Math.min(1, 3 * DT); w.vy += (uy * v - w.vy) * Math.min(1, 3 * DT);
      w.x += w.vx * DT; w.y += w.vy * DT;
      if (dh < 46 && dashing) { S.wisps.splice(i, 1); S.pops++; S.score += 5; S.freeze = 0.05; S.ev.push({ k: 'pop', t, x: w.x, y: w.y - 30 }); continue; }
      if (dh < 34 && t - S.hurtT > K.IFRAME && !dashing) { S.hurtT = t; S.hearts--; S.wisps.splice(i, 1); S.freeze = 0.12;
        const kx = (S.x - w.x) / (dh || 1), ky = (S.y - w.y) / (dh || 1); S.vx = kx * 520; S.vy = ky * 520;
        S.ev.push({ k: 'hurt', t, x: S.x, y: S.y - 30, lost: S.carry });
        for (let j = 0; j < S.carry; j++) { const a = j * 2.1 + t; S.logs.push({ x: S.x + Math.cos(a) * 70, y: S.y + Math.sin(a) * 50, id: 1000 + S.logN++, t0: t, drop: 1 }); }
        S.carry = 0; continue; }
      if (df < 58) { S.wisps.splice(i, 1); S.fuel = Math.max(0, S.fuel - K.SNUFF); S.ev.push({ k: 'snuff', t, x: FIRE.x, y: FIRE.y - 30 }); continue; }
    }
    if (S.hearts <= 0 || S.fuel <= 0) { S.over = S.hearts <= 0 ? 'caught' : 'out'; S.tEnd = t; S.best = Math.max(S.best, S.score); S.ev.push({ k: 'over', t, x: S.x, y: S.y });
      S.t = t; S.steps++; return S; }
    if (S.freeze > 0) { S.freeze -= DT; S.t = t; S.steps++; return S; }
    // ---- hero: 8-direction run with accel / decel, dash on Space / X ----
    const ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0), il = Math.hypot(ix, iy) || 1;
    const slow = 1 - 0.07 * S.carry;                                            // wood is heavy
    const app = (v, tgt) => { const a = (Math.abs(tgt) > Math.abs(v) ? K.ACC : K.DEC) * DT; return v < tgt ? Math.min(tgt, v + a) : Math.max(tgt, v - a); };
    S.vx = app(S.vx, ix / il * K.RUN * slow); S.vy = app(S.vy, iy / il * K.RUN * slow);
    if (ix) S.faceX = ix; if (ix || iy) S.faceY = iy || S.faceY;
    const act = inp.act || inp.jump, edge = act && !S.prevAct; S.prevAct = act; S.dashCD = Math.max(0, S.dashCD - DT);
    if (edge && S.dashCD <= 0) { const dx = ix || (Math.abs(S.vx) > 20 ? Math.sign(S.vx) : S.faceX), dy = iy;
      const dl = Math.hypot(dx, dy) || 1; S.dashT = t; S.dashCD = K.DASH_CD; S.dashD = [dx / dl, dy / dl]; S.ev.push({ k: 'dash', t, x: S.x, y: S.y, dx: dx / dl, dy: dy / dl }); }
    const mvx = (t - S.dashT < K.DASH_T) ? S.dashD[0] * K.DASH : S.vx, mvy = (t - S.dashT < K.DASH_T) ? S.dashD[1] * K.DASH : S.vy;
    S.x += mvx * DT; S.y += mvy * DT;
    for (const o of SOLIDS) { const dx = S.x - o.x, dy = (S.y - o.y) * 1.4, d = Math.hypot(dx, dy), r = o.r + K.R;
      if (d < r && d > 0) { S.x = o.x + dx / d * r; S.y = o.y + dy / d * r / 1.4; } }
    S.x = Math.max(WORLD.x0 + 30, Math.min(WORLD.x1 - 30, S.x)); S.y = Math.max(WORLD.y0 + 60, Math.min(WORLD.y1 - 20, S.y));
    const moved = Math.hypot(mvx, mvy) * DT;
    if (moved > 0.05) { const b = Math.floor(S.dist / 60); S.dist += moved; if (Math.floor(S.dist / 60) !== b) S.ev.push({ k: 'step', t, x: S.x, y: S.y }); }
    // ---- pick up logs, feed the fire ----
    for (let i = S.logs.length - 1; i >= 0; i--) { const g = S.logs[i];
      if (S.carry < K.CARRY && t - g.t0 > 0.4 && Math.hypot(g.x - S.x, (g.y - S.y) * 1.3) < 40) { S.logs.splice(i, 1); S.carry++; S.ev.push({ k: 'pick', t, x: g.x, y: g.y, n: S.carry }); } }
    if (S.carry > 0 && Math.hypot(S.x - FIRE.x, (S.y - FIRE.y) * 1.3) < 105) { const n = S.carry;
      S.fuel = Math.min(100, S.fuel + n * K.LOG_FUEL); S.score += 10 * n * n; S.delivered += n; S.carry = 0;
      S.ev.push({ k: 'feed', t, x: FIRE.x, y: FIRE.y - 40, n, pts: 10 * n * n }); }
    // ---- camera: critically damped follow with look-ahead, biased toward the fire ----
    const tgx = S.x - VIEW.W / 2 + S.vx * 0.3 + (FIRE.x - S.x) * 0.18, tgy = S.y - VIEW.H / 2 + S.vy * 0.25 + (FIRE.y - S.y) * 0.18;
    const tg = [tgx, tgy]; clampCam(tg);
    S.camV[0] += (30 * (tg[0] - S.cam[0]) - 11 * S.camV[0]) * DT; S.cam[0] += S.camV[0] * DT;
    S.camV[1] += (30 * (tg[1] - S.cam[1]) - 11 * S.camV[1]) * DT; S.cam[1] += S.camV[1] * DT;
    if (S.ev.length > 64) S.ev.splice(0, S.ev.length - 64);
    S.t = t; S.steps++; return S;
  }

  // autopilot (attract demo, and ?auto=1 play): feed the fire, fetch the nearest log, dash through wisps that get close
  const scriptInput = (t, S) => { const inp = { left: 0, right: 0, up: 0, down: 0, jump: 0, act: 0 };
    let tx = FIRE.x, ty = FIRE.y + 70;
    const near = S.wisps.map((w) => [Math.hypot(w.x - S.x, w.y - S.y), w]).sort((a, b) => a[0] - b[0])[0];
    const goHome = S.carry >= K.CARRY || (S.carry > 0 && S.fuel < 40);
    if (!goHome && S.logs.length) { let best = null, bd = 1e9;
      for (const g of S.logs) { const d = Math.hypot(g.x - S.x, g.y - S.y) + 0.35 * Math.hypot(g.x - FIRE.x, g.y - FIRE.y); if (d < bd && t - g.t0 > 0.4) { bd = d; best = g; } }
      if (best) { tx = best.x; ty = best.y; } }
    if (near && near[0] < 150) { const w = near[1];
      if (near[0] < 110 && S.dashCD <= 0) { tx = w.x; ty = w.y + 10; inp.act = (Math.floor(t * 120) % 2); }
      else if (S.dashCD > 0.15) { tx = S.x + (S.x - w.x); ty = S.y + (S.y - w.y); } }
    const dx = tx - S.x, dy = ty - S.y;
    if (Math.hypot(dx, dy) > 12) { if (Math.abs(dx) > 10) inp[dx > 0 ? 'right' : 'left'] = 1; if (Math.abs(dy) > 10) inp[dy > 0 ? 'down' : 'up'] = 1; }
    return inp; };
  let cache = null;
  function at(t) {
    const loop = Math.floor(t / L), q = t - loop * L, n = Math.round(q / DT);
    if (!cache || cache.loop !== loop || cache.S.steps > n) cache = { loop, S: Object.assign(create(), { wt0: loop * L }) };
    const S = cache.S; while (S.steps < n) step(S, scriptInput(S.t, S));
    return Object.assign({}, S, { loop, q });
  }
  const demoCheck = (S) => S.delivered >= 6 && S.pops >= 3;
  const selfCheck = () => { const f = [];
    for (let n = 0; n < 30; n++) { const [x, y] = logSpot(n); if (!free(x, y)) f.push(`log ${n} spawns inside a solid at ${x | 0},${y | 0}`); }
    const s = create(); if (!free(s.x, s.y, 0)) f.push('hero spawns inside a solid'); return f; };
  root.SIM = { DT, L, K, VIEW, WORLD, FIRE, HINT, TREES, ROCKS, SOLIDS, TUFTS, burn, lightR, spawnGap, wispV, create, spawn, respawn, outOfPlay, step, at, scriptInput, demoCheck, selfCheck };
  if (typeof module !== 'undefined') module.exports = root.SIM;
})(typeof window !== 'undefined' ? window : globalThis);
