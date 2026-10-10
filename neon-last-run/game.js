(() => {
'use strict';

/* ============ DOM ============ */
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const ui = {
  hud: $('hud'), hudScore: $('hudScore'), hudTime: $('hudTime'), hudSub: $('hudSub'),
  hudHigh: $('hudHigh'), hudMode: $('hudMode'),
  healthFill: $('healthFill'), healthText: $('healthText'),
  pulseWrap: $('pulseWrap'), pulseFill: $('pulseFill'),
  menu: $('menu-screen'), pause: $('pause-screen'), over: $('gameover-screen'),
  finalTitle: $('finalTitle'), finalStats: $('finalStats'), finalScore: $('finalScore'),
  newBest: $('newBest'), pauseInfo: $('pauseInfo'),
  menuHighSurvival: $('menuHighSurvival'), menuHighRunner: $('menuHighRunner'),
  topHighSurvival: $('topHighSurvival'), topHighRunner: $('topHighRunner'),
  flash: $('flash'), touch: $('touch-controls'),
  btnJump: $('btnJump'), btnSlide: $('btnSlide'), btnPulse: $('btnPulse'),
  btnMute: $('btnMute'),
};

let W = 960, H = 600, DPR = 1;

function resize() {
  const wrap = document.getElementById('game-wrap');
  const r = wrap.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(320, r.width);
  H = Math.max(320, r.height);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);

/* ============ STORAGE ============ */
const store = {
  get(k, fb) {
    try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); }
    catch (e) { return fb; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
let bestSurvival = Number(store.get('neon_last60_high', 0)) || 0;
let bestRunner = Number(store.get('neon_glitch_high', 0)) || 0;
let muted = store.get('neon_muted', false) === true;
function refreshBest() {
  ui.menuHighSurvival.textContent = bestSurvival;
  ui.topHighSurvival.textContent = bestSurvival;
  ui.menuHighRunner.textContent = bestRunner;
  ui.topHighRunner.textContent = bestRunner;
}

/* ============ AUDIO (synthesized, gesture-gated) ============ */
const Sfx = {
  ac: null, master: null,
  ensure() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = muted ? 0 : 0.35;
      this.master.connect(this.ac.destination);
    } catch (e) { /* audio unavailable */ }
  },
  setMuted(m) {
    muted = m;
    store.set('neon_muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
    ui.btnMute.classList.toggle('muted', m);
    ui.btnMute.textContent = m ? '✕' : '♪';
  },
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ac || muted) return;
    try {
      const t = this.ac.currentTime;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  },
  noise(dur, vol) {
    if (!this.ac || muted) return;
    try {
      const t = this.ac.currentTime;
      const len = Math.floor(this.ac.sampleRate * dur);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource(); src.buffer = buf;
      const g = this.ac.createGain();
      g.gain.setValueAtTime(vol || 0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(g); g.connect(this.master); src.start(t);
    } catch (e) {}
  },
  play(name) {
    if (!this.ac || muted) return;
    switch (name) {
      case 'click': this.tone(660, 0.07, 'square', 0.15, 880); break;
      case 'jump': this.tone(280, 0.18, 'square', 0.2, 720); break;
      case 'slide': this.tone(500, 0.15, 'sawtooth', 0.14, 160); break;
      case 'pulse': this.tone(180, 0.3, 'sawtooth', 0.25, 60); this.noise(0.2, 0.2); break;
      case 'kill': this.tone(900, 0.12, 'square', 0.16, 200); this.noise(0.12, 0.15); break;
      case 'hit': this.tone(160, 0.3, 'sawtooth', 0.3, 50); this.noise(0.25, 0.3); break;
      case 'pickup': this.tone(520, 0.1, 'sine', 0.22, 780); setTimeout(() => this.tone(780, 0.14, 'sine', 0.22, 1180), 70); break;
      case 'orb': this.tone(880, 0.09, 'sine', 0.18, 1320); break;
      case 'tick': this.tone(1000, 0.06, 'square', 0.12); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.2), i * 130)); break;
      case 'over': [400, 300, 220, 130].forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 'sawtooth', 0.22, f * 0.7), i * 160)); break;
    }
  },
};

/* ============ GAME STATE ============ */
const G = {
  screen: 'menu',       // menu | playing | paused | over
  mode: null,           // survival | runner
  score: 0,
  shakeT: 0, shakeMag: 0,
  bgT: 0,
  lastTickSecond: -1,
};
let rafId = null;
let lastTime = 0;

const particles = [];
const floaters = [];
const stars = Array.from({ length: 90 }, () => ({
  x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5, tw: Math.random() * 6.28,
}));

function shake(mag, dur) {
  G.shakeMag = Math.max(G.shakeMag, mag);
  G.shakeT = Math.max(G.shakeT, dur);
}
function flash(kind) {
  ui.flash.className = kind || 'hit';
  // force reflow then fade out
  void ui.flash.offsetWidth;
  setTimeout(() => { ui.flash.className = ''; }, kind === 'heal' ? 220 : 160);
}
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (speed || 240) * (0.3 + Math.random());
    particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.5, age: 0,
      color, size: 1.5 + Math.random() * 3,
    });
  }
}
function floater(x, y, text, color) {
  floaters.push({ x, y, text, color: color || '#fff', age: 0, life: 0.9 });
}
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

/* ============ SURVIVAL MODE ============ */
const SURV_TIME = 60;
const S = {};
function resetSurvival() {
  S.px = W / 2; S.py = H / 2;
  S.pr = 14;
  S.hp = 100; S.maxHp = 100;
  S.speed = 270;
  S.iframes = 0;
  S.elapsed = 0; S.left = SURV_TIME;
  S.kills = 0; S.wave = 1;
  S.enemies = []; S.pickups = []; S.pulses = [];
  S.spawnT = 0.8; S.pickupT = 4;
  S.pulseCd = 0; S.pulseCdMax = 1.15;
  S.boostT = 0;
  S.touchTX = null; S.touchTY = null;
  G.score = 0;
}
function spawnEnemy() {
  const m = Math.min(1, S.elapsed / SURV_TIME); // 0..1 difficulty
  const edge = (Math.random() * 4) | 0;
  let x, y;
  if (edge === 0) { x = -20; y = Math.random() * H; }
  else if (edge === 1) { x = W + 20; y = Math.random() * H; }
  else if (edge === 2) { x = Math.random() * W; y = -20; }
  else { x = Math.random() * W; y = H + 20; }
  const roll = Math.random();
  let e;
  if (roll < 0.55 - m * 0.15) {
    e = { x, y, r: 13, hp: 1, speed: 95 + m * 70 + Math.random() * 30, color: '#ff2d95', kind: 'chaser', wob: Math.random() * 6.28 };
  } else if (roll < 0.82) {
    e = { x, y, r: 9, hp: 1, speed: 175 + m * 90 + Math.random() * 40, color: '#00f6ff', kind: 'dart', wob: Math.random() * 6.28 };
  } else {
    e = { x, y, r: 21, hp: 3, speed: 55 + m * 35, color: '#a855f7', kind: 'tank', wob: Math.random() * 6.28 };
  }
  S.enemies.push(e);
}
function spawnPickup() {
  const heal = Math.random() < 0.55 || S.hp > 70;
  S.pickups.push({
    x: 40 + Math.random() * (W - 80),
    y: 60 + Math.random() * (H - 100),
    r: 11,
    kind: heal ? 'hp' : 'speed',
    age: 0, life: 10,
  });
}
function firePulse() {
  if (S.pulseCd > 0 || G.screen !== 'playing' || G.mode !== 'survival') return;
  S.pulseCd = S.pulseCdMax;
  S.pulses.push({ x: S.px, y: S.py, r: 10, maxR: 130, age: 0, life: 0.35, hitSet: new Set() });
  Sfx.play('pulse');
  shake(4, 0.15);
}
function hurtPlayer(dmg) {
  if (S.iframes > 0) return;
  S.hp -= dmg;
  S.iframes = 0.7;
  Sfx.play('hit');
  shake(10, 0.35);
  flash('hit');
  burst(S.px, S.py, '#ff2d5d', 18, 300);
  if (S.hp <= 0) { S.hp = 0; gameOver(false); }
}
function updateSurvival(dt) {
  S.elapsed += dt;
  S.left = Math.max(0, SURV_TIME - S.elapsed);
  S.wave = Math.floor(S.elapsed / 10) + 1;
  S.iframes = Math.max(0, S.iframes - dt);
  S.pulseCd = Math.max(0, S.pulseCd - dt);
  S.boostT = Math.max(0, S.boostT - dt);

  // countdown ticks for last 5 seconds
  const sec = Math.ceil(S.left);
  if (S.left <= 5.5 && sec !== G.lastTickSecond) { G.lastTickSecond = sec; Sfx.play('tick'); }
  if (S.left <= 0) { gameOver(true); return; }

  // movement (keyboard + touch target)
  let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (mx !== 0 || my !== 0) {
    const l = Math.hypot(mx, my); mx /= l; my /= l;
    S.touchTX = null;
  } else if (S.touchTX !== null) {
    const dx = S.touchTX - S.px, dy = S.touchTY - S.py;
    const d = Math.hypot(dx, dy);
    if (d > 6) { mx = dx / d; my = dy / d; } else { S.touchTX = null; }
  }
  const sp = S.boostT > 0 ? 430 : S.speed;
  S.px = Math.max(S.pr, Math.min(W - S.pr, S.px + mx * sp * dt));
  S.py = Math.max(S.pr + 34, Math.min(H - S.pr, S.py + my * sp * dt));

  // spawns — rate ramps up
  const m = S.elapsed / SURV_TIME;
  const interval = 1.05 - m * 0.75; // 1.05s -> 0.30s
  S.spawnT -= dt;
  if (S.spawnT <= 0) {
    S.spawnT = interval;
    const batch = 1 + (S.wave >= 3 ? 1 : 0) + (S.wave >= 5 ? 1 : 0);
    for (let i = 0; i < batch; i++) spawnEnemy();
  }
  S.pickupT -= dt;
  if (S.pickupT <= 0) { S.pickupT = 5.5 + Math.random() * 2.5; spawnPickup(); }

  // enemies chase
  for (const e of S.enemies) {
    e.wob += dt * 4;
    const dx = S.px - e.x, dy = S.py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    let vx = (dx / d) * e.speed, vy = (dy / d) * e.speed;
    if (e.kind === 'dart') { // sine weave
      const px = -dy / d, py = dx / d;
      vx += px * Math.sin(e.wob) * 60; vy += py * Math.sin(e.wob) * 60;
    }
    e.x += vx * dt; e.y += vy * dt;
  }

  // pulses expand + damage
  for (let i = S.pulses.length - 1; i >= 0; i--) {
    const p = S.pulses[i];
    p.age += dt;
    p.r = 10 + (p.maxR - 10) * (p.age / p.life);
    p.x = S.px; p.y = S.py;
    for (let j = S.enemies.length - 1; j >= 0; j--) {
      const e = S.enemies[j];
      if (p.hitSet.has(e)) continue;
      const rr = p.r + e.r;
      if (dist2(p.x, p.y, e.x, e.y) < rr * rr) {
        p.hitSet.add(e);
        e.hp -= 2;
        burst(e.x, e.y, '#ffffff', 8, 220);
        if (e.hp <= 0) {
          S.enemies.splice(j, 1);
          S.kills++;
          G.score += e.kind === 'tank' ? 250 : e.kind === 'dart' ? 150 : 100;
          floater(e.x, e.y, '+' + (e.kind === 'tank' ? 250 : e.kind === 'dart' ? 150 : 100), '#ffe14d');
          burst(e.x, e.y, e.color, 16, 320);
          Sfx.play('kill');
        }
      }
    }
    if (p.age >= p.life) S.pulses.splice(i, 1);
  }

  // enemy <-> player collision
  for (let j = S.enemies.length - 1; j >= 0; j--) {
    const e = S.enemies[j];
    const rr = e.r + S.pr - 3;
    if (dist2(e.x, e.y, S.px, S.py) < rr * rr) {
      if (e.kind === 'tank') {
        // tank survives contact, bounces back
        hurtPlayer(18);
        const dx = e.x - S.px, dy = e.y - S.py, d = Math.hypot(dx, dy) || 1;
        e.x = S.px + (dx / d) * (rr + 6); e.y = S.py + (dy / d) * (rr + 6);
      } else {
        S.enemies.splice(j, 1);
        burst(e.x, e.y, e.color, 14, 280);
        hurtPlayer(e.kind === 'dart' ? 12 : 10);
        G.score = Math.max(0, G.score - 25);
      }
    }
  }

  // pickups
  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const p = S.pickups[i];
    p.age += dt;
    if (p.age >= p.life) { S.pickups.splice(i, 1); continue; }
    const rr = p.r + S.pr;
    if (dist2(p.x, p.y, S.px, S.py) < rr * rr) {
      S.pickups.splice(i, 1);
      Sfx.play('pickup');
      flash('heal');
      if (p.kind === 'hp') {
        S.hp = Math.min(S.maxHp, S.hp + 28);
        floater(S.px, S.py - 24, '+28 HP', '#39ff88');
        burst(S.px, S.py, '#39ff88', 14, 240);
      } else {
        S.boostT = 6;
        floater(S.px, S.py - 24, 'OVERDRIVE!', '#ffe14d');
        burst(S.px, S.py, '#ffe14d', 14, 240);
      }
      G.score += 50;
    }
  }

  // passive score for staying alive
  G.score += dt * 12;

  updateParticles(dt);
}

/* ============ RUNNER MODE ============ */
const R = {};
function resetRunner() {
  R.groundY = H * 0.78;
  R.px = Math.max(60, W * 0.22);
  R.pw = 32; R.ph = 50; R.slideH = 24;
  R.py = R.groundY - R.ph; // top-left y
  R.vy = 0; R.onGround = true;
  R.sliding = 0; R.slideMax = 0.62;
  R.coyote = 0;
  R.speed = 380; R.maxSpeed = 980;
  R.dist = 0; R.orbs = 0; R.orbHeal = 0;
  R.hp = 3; R.maxHp = 3; R.iframes = 0;
  R.obstacles = []; R.orbItems = [];
  R.spawnT = 1.0;
  R.dead = false;
  R.runTime = 0;
  R.buildings = Array.from({ length: 14 }, (_, i) => ({
    x: (i / 14) * W, w: 40 + Math.random() * 70, h: 60 + Math.random() * 170,
    hue: Math.random() < 0.5 ? '0,246,255' : '168,85,247',
  }));
  G.score = 0;
}
function runnerSpawn() {
  const gap = Math.max(260, 640 - R.speed * 0.35) + Math.random() * 260;
  const kindRoll = Math.random();
  const wBase = 26 + Math.random() * 22;
  if (kindRoll < 0.42) {
    // low barricade — JUMP
    R.obstacles.push({ x: W + 40, y: R.groundY - 46, w: wBase, h: 46, kind: 'low', color: '#ff2d95' });
  } else if (kindRoll < 0.72) {
    // high gate — SLIDE (hangs low: standing hits it, sliding clears it)
    R.obstacles.push({ x: W + 40, y: R.groundY - 66, w: wBase + 14, h: 36, kind: 'high', color: '#00f6ff' });
  } else if (kindRoll < 0.88) {
    // tall tower — JUMP (harder)
    R.obstacles.push({ x: W + 40, y: R.groundY - 84, w: wBase, h: 84, kind: 'tall', color: '#a855f7' });
  } else {
    // double low
    R.obstacles.push({ x: W + 40, y: R.groundY - 46, w: wBase, h: 46, kind: 'low', color: '#ff2d95' });
    R.obstacles.push({ x: W + 40 + wBase + 120, y: R.groundY - 46, w: wBase, h: 46, kind: 'low', color: '#ff2d95' });
  }
  // orb arc over / under
  if (Math.random() < 0.8) {
    const n = 3 + ((Math.random() * 3) | 0);
    const high = kindRoll < 0.42 || kindRoll >= 0.72;
    for (let i = 0; i < n; i++) {
      R.orbItems.push({
        x: W + 60 + i * 38,
        y: high ? R.groundY - 130 - Math.sin((i / (n - 1)) * Math.PI) * 40 : R.groundY - 34,
        r: 9, age: 0,
      });
    }
  }
  R.spawnT = gap / R.speed;
}
function runnerJump() {
  if (G.screen !== 'playing' || G.mode !== 'runner') return;
  if (R.onGround || R.coyote > 0) {
    const jumpV = -(Math.max(760, H * 1.35));
    R.vy = jumpV;
    R.onGround = false; R.coyote = 0; R.sliding = 0;
    Sfx.play('jump');
    burst(R.px + R.pw / 2, R.groundY, '#00f6ff', 8, 180);
  }
}
function runnerSlide() {
  if (G.screen !== 'playing' || G.mode !== 'runner') return;
  R.sliding = R.slideMax;
  if (!R.onGround) R.vy += 1400 * 0.016; // fast-fall nudge
  Sfx.play('slide');
}
function runnerHurt(ob) {
  if (R.iframes > 0) return;
  R.hp -= 1;
  R.iframes = 1.1;
  Sfx.play('hit');
  shake(12, 0.4);
  flash('hit');
  burst(R.px + R.pw / 2, R.py + R.ph / 2, '#ff2d5d', 20, 320);
  // knock the obstacle away so it can't multi-hit
  ob.dead = true;
  if (R.hp <= 0) { R.hp = 0; gameOver(false); }
}
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function updateRunner(dt) {
  R.runTime += dt;
  R.iframes = Math.max(0, R.iframes - dt);
  R.coyote = R.onGround ? 0.09 : Math.max(0, R.coyote - dt);
  R.speed = Math.min(R.maxSpeed, R.speed + dt * 9);
  R.sliding = Math.max(0, R.sliding - dt);

  // keyboard slide hold also works
  if (keys.has('ArrowDown') || keys.has('KeyS')) R.sliding = Math.max(R.sliding, 0.1);

  // physics
  const grav = 2800;
  R.vy += grav * dt;
  R.py += R.vy * dt;
  R.groundY = H * 0.78;
  const curH = R.sliding > 0 ? R.slideH : R.ph;
  if (R.py + curH >= R.groundY) {
    R.py = R.groundY - curH;
    if (!R.onGround && R.vy > 500) burst(R.px + R.pw / 2, R.groundY, '#a855f7', 6, 150);
    R.vy = 0; R.onGround = true;
  } else {
    R.onGround = false;
  }

  // scroll world
  const dx = R.speed * dt;
  R.dist += dx;
  R.spawnT -= dt;
  if (R.spawnT <= 0) runnerSpawn();
  for (const b of R.buildings) {
    b.x -= dx * 0.25;
    if (b.x + b.w < -20) { b.x = W + Math.random() * 100; b.h = 60 + Math.random() * 170; b.w = 40 + Math.random() * 70; }
  }

  const px = R.px, py = R.py, pw = R.pw, ph = curH;

  for (let i = R.obstacles.length - 1; i >= 0; i--) {
    const o = R.obstacles[i];
    o.x -= dx;
    if (o.x + o.w < -60 || o.dead) { R.obstacles.splice(i, 1); continue; }
    // forgiving hitbox
    const shrink = 5;
    if (rectsOverlap(px + shrink, py + shrink, pw - shrink * 2, ph - shrink,
                     o.x + 2, o.y + 2, o.w - 4, (o.kind === 'high' ? o.h : o.h) - 2)) {
      runnerHurt(o);
      if (G.screen !== 'playing') return;
    } else if (!o.passed && o.x + o.w < px) {
      o.passed = true;
      G.score += 25;
      floater(px + pw, py - 10, '+25', '#00f6ff');
    }
  }
  for (let i = R.orbItems.length - 1; i >= 0; i--) {
    const o = R.orbItems[i];
    o.x -= dx; o.age += dt;
    if (o.x < -30) { R.orbItems.splice(i, 1); continue; }
    const cx = Math.max(px, Math.min(o.x, px + pw));
    const cy = Math.max(py, Math.min(o.y, py + ph));
    if (dist2(o.x, o.y, cx, cy) < (o.r + 2) * (o.r + 2)) {
      R.orbItems.splice(i, 1);
      R.orbs++; R.orbHeal++;
      G.score += 50;
      floater(o.x, o.y - 12, '+50', '#ffe14d');
      burst(o.x, o.y, '#ffe14d', 8, 200);
      Sfx.play('orb');
      if (R.orbHeal >= 15 && R.hp < R.maxHp) { R.orbHeal = 0; R.hp++; floater(px, py - 26, '+1 HP', '#39ff88'); }
    }
  }

  G.score += dx * 0.06; // distance trickle
  updateParticles(dt);
}

/* ============ PARTICLES / FLOATERS ============ */
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= (1 - 2.2 * dt); p.vy *= (1 - 2.2 * dt);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.age += dt; f.y -= 44 * dt;
    if (f.age >= f.life) floaters.splice(i, 1);
  }
  if (particles.length > 500) particles.splice(0, particles.length - 500);
}

/* ============ FLOW ============ */
function show(el, on) { el.classList.toggle('hidden', !on); }
function setTouchVisible() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(W, window.innerWidth) < 720;
  const showT = (coarse || small || 'ontouchstart' in window) && G.screen === 'playing';
  show(ui.touch, showT);
  if (showT) {
    const isSurv = G.mode === 'survival';
    show(ui.btnJump, !isSurv); show(ui.btnSlide, !isSurv); show(ui.btnPulse, isSurv);
    $('touchLeft').style.display = isSurv ? 'none' : 'flex';
    $('touchRight').style.display = isSurv ? 'flex' : 'none';
    // runner uses both sides: show left buttons
    if (!isSurv) { $('touchLeft').style.display = 'flex'; }
  }
}
function startGame(mode) {
  Sfx.ensure(); Sfx.play('click');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  G.mode = mode;
  G.screen = 'playing';
  G.score = 0;
  G.shakeT = 0; G.shakeMag = 0;
  G.lastTickSecond = -1;
  particles.length = 0; floaters.length = 0;
  if (mode === 'survival') resetSurvival(); else resetRunner();
  show(ui.menu, false); show(ui.pause, false); show(ui.over, false); show(ui.hud, true);
  ui.hudMode.textContent = mode === 'survival' ? 'LAST 60 SECONDS' : 'GLITCH RUNNER';
  ui.pulseWrap.classList.toggle('hidden', mode !== 'survival');
  setTouchVisible();
  lastTime = performance.now();
}
function pauseGame() {
  if (G.screen !== 'playing') return;
  G.screen = 'paused';
  Sfx.play('click');
  ui.pauseInfo.textContent = G.mode === 'survival'
    ? ('Survived ' + S.elapsed.toFixed(1) + 's — score ' + Math.floor(G.score))
    : (Math.floor(R.dist / 50) + 'm — score ' + Math.floor(G.score));
  show(ui.pause, true);
}
function resumeGame() {
  if (G.screen !== 'paused') return;
  Sfx.ensure(); Sfx.play('click');
  G.screen = 'playing';
  show(ui.pause, false);
  lastTime = performance.now();
}
function toMenu() {
  Sfx.play('click');
  G.screen = 'menu'; G.mode = null;
  show(ui.menu, true); show(ui.pause, false); show(ui.over, false); show(ui.hud, false);
  setTouchVisible();
}
function gameOver(win) {
  if (G.screen !== 'playing') return;
  G.screen = 'over';
  shake(14, 0.5);
  let final = Math.floor(G.score);
  let isBest = false;
  let statsHtml = '';
  if (G.mode === 'survival') {
    if (win) { final += Math.floor(S.hp) * 10 + 1000; G.score = final; }
    statsHtml =
      '<div>' + (win ? '🏆 ARENA CLEARED — you survived the full 60!' : 'Survived <b>' + S.elapsed.toFixed(1) + 's</b> of 60') + '</div>' +
      '<div>Kills <b>' + S.kills + '</b> · Wave <b>' + S.wave + '</b> · HP <b>' + Math.max(0, Math.ceil(S.hp)) + '</b></div>';
    if (final > bestSurvival) { bestSurvival = final; store.set('neon_last60_high', final); isBest = true; }
  } else {
    const m = Math.floor(R.dist / 50);
    statsHtml =
      '<div>Distance <b>' + m + 'm</b> · Orbs <b>' + R.orbs + '</b></div>' +
      '<div>Top speed <b>' + Math.floor(R.speed) + '</b> · HP left <b>' + R.hp + '</b></div>';
    if (final > bestRunner) { bestRunner = final; store.set('neon_glitch_high', final); isBest = true; }
  }
  refreshBest();
  ui.finalTitle.textContent = win ? 'RUN COMPLETE — YOU SURVIVED' : (G.mode === 'runner' ? 'SIGNAL LOST' : 'FLATLINED');
  ui.finalTitle.classList.toggle('win', !!win);
  ui.finalStats.innerHTML = statsHtml;
  ui.finalScore.textContent = final;
  show(ui.newBest, isBest);
  show(ui.over, true);
  setTouchVisible();
  Sfx.play(win ? 'win' : 'over');
  if (!win) burst(W / 2, H / 2, '#ff2d5d', 40, 420);
  else burst(W / 2, H / 2, '#39ff88', 50, 420);
}

/* ============ HUD ============ */
function updateHUD() {
  ui.hudScore.textContent = Math.floor(G.score);
  if (G.mode === 'survival') {
    ui.hudTime.textContent = S.left.toFixed(1);
    ui.hudSub.textContent = 'SURVIVE · WAVE ' + S.wave;
    ui.hudTime.classList.toggle('danger', S.left <= 10);
    ui.hudHigh.textContent = Math.max(bestSurvival, Math.floor(G.score));
    const pct = Math.max(0, S.hp / S.maxHp * 100);
    ui.healthFill.style.width = pct + '%';
    ui.healthFill.classList.toggle('low', pct < 35);
    ui.healthText.textContent = Math.ceil(S.hp);
    ui.pulseFill.style.width = ((1 - S.pulseCd / S.pulseCdMax) * 100) + '%';
  } else if (G.mode === 'runner') {
    ui.hudTime.textContent = Math.floor(R.dist / 50) + 'm';
    ui.hudSub.textContent = 'SPEED ' + Math.floor(R.speed);
    ui.hudTime.classList.remove('danger');
    ui.hudHigh.textContent = Math.max(bestRunner, Math.floor(G.score));
    const pct = Math.max(0, R.hp / R.maxHp * 100);
    ui.healthFill.style.width = pct + '%';
    ui.healthFill.classList.toggle('low', R.hp <= 1);
    ui.healthText.textContent = '♥'.repeat(Math.max(0, R.hp)) + '♡'.repeat(Math.max(0, R.maxHp - R.hp));
  }
}

/* ============ RENDER ============ */
function drawBackground() {
  // base
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#070a1c'); g.addColorStop(0.6, '#05060e'); g.addColorStop(1, '#0b0618');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // stars
  for (const s of stars) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(G.bgT * 1.5 + s.tw));
    ctx.globalAlpha = tw * 0.8;
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(s.x * W, s.y * H * 0.7, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  if (G.mode === 'runner' && G.screen !== 'menu') {
    // sun
    const sx = W * 0.72, sy = H * 0.42, sr = Math.min(W, H) * 0.13;
    const sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
    sg.addColorStop(0, '#ffe14d'); sg.addColorStop(0.5, '#ff2d95'); sg.addColorStop(1, '#a855f7');
    ctx.save();
    ctx.shadowColor = '#ff2d95'; ctx.shadowBlur = 40;
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(5,6,14,.85)';
    for (let i = 0; i < 4; i++) ctx.fillRect(sx - sr - 4, sy + (i * sr) / 4, sr * 2 + 8, 3 + i);

    // buildings
    const gy = H * 0.78;
    for (const b of R.buildings || []) {
      ctx.fillStyle = 'rgba(8,10,26,.95)';
      ctx.fillRect(b.x, gy - b.h, b.w, b.h);
      ctx.strokeStyle = 'rgba(' + b.hue + ',.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x, gy - b.h, b.w, b.h);
      ctx.fillStyle = 'rgba(' + b.hue + ',.18)';
      for (let wy = gy - b.h + 8; wy < gy - 8; wy += 16)
        for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 14)
          if ((wx + wy) % 3 < 1.4) ctx.fillRect(wx, wy, 6, 8);
    }
    // ground grid
    ctx.strokeStyle = 'rgba(0,246,255,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,246,255,.12)';
    ctx.lineWidth = 1;
    const off = (G.bgT * R.speed * 0.6) % 46;
    for (let x = -46; x < W + 46; x += 46) {
      ctx.beginPath(); ctx.moveTo(x - off + 23, gy); ctx.lineTo(x - off - 30, H); ctx.stroke();
    }
    for (let i = 1; i < 5; i++) {
      const y = gy + (i * i * (H - gy)) / 25;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  } else {
    // top-down arena grid
    const off = (G.bgT * 24) % 44;
    ctx.strokeStyle = 'rgba(0,246,255,.10)';
    ctx.lineWidth = 1;
    for (let x = -44; x < W + 44; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -44 + off; y < H + 44; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // arena border
    ctx.strokeStyle = 'rgba(0,246,255,.6)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f6ff'; ctx.shadowBlur = 16;
    ctx.strokeRect(8, 42, W - 16, H - 50);
    ctx.shadowBlur = 0;
  }
}
function drawGlowCircle(x, y, r, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.shadowColor = color; ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function renderSurvival() {
  // pickups
  const t = performance.now() / 1000;
  for (const p of S.pickups) {
    const bob = Math.sin(t * 4 + p.x) * 3;
    const fade = p.life - p.age < 2 ? (Math.sin(t * 10) > 0 ? 1 : 0.3) : 1;
    ctx.save(); ctx.globalAlpha = fade;
    if (p.kind === 'hp') {
      drawGlowCircle(p.x, p.y + bob, p.r, 'rgba(57,255,136,.25)', 1);
      ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#39ff88';
      ctx.fillRect(p.x - 3, p.y + bob - 9, 6, 18);
      ctx.fillRect(p.x - 9, p.y + bob - 3, 18, 6);
    } else {
      drawGlowCircle(p.x, p.y + bob, p.r, 'rgba(255,225,77,.25)', 1);
      ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(p.x + 2, p.y + bob - 10); ctx.lineTo(p.x - 5, p.y + bob + 1);
      ctx.lineTo(p.x, p.y + bob + 1); ctx.lineTo(p.x - 2, p.y + bob + 10);
      ctx.lineTo(p.x + 5, p.y + bob - 1); ctx.lineTo(p.x, p.y + bob - 1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // enemies
  for (const e of S.enemies) {
    ctx.save();
    ctx.shadowColor = e.color; ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a0d20';
    ctx.strokeStyle = e.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.kind === 'tank' ? 6 : 4, 0, Math.PI * 2); ctx.fill();
    if (e.kind === 'tank') {
      ctx.strokeStyle = e.color;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r - 5 - i * 0, e.wob + i * 2.1, e.wob + i * 2.1 + 1.4); ctx.stroke();
      }
    }
    // hp pips for tank
    if (e.kind === 'tank' && e.hp < 3) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.fillRect(e.x - 14, e.y - e.r - 10, 28 * (e.hp / 3), 4);
    }
    ctx.restore();
  }
  // pulses
  for (const p of S.pulses) {
    ctx.save();
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.strokeStyle = '#00f6ff'; ctx.lineWidth = 4;
    ctx.shadowColor = '#00f6ff'; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ff2d95'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // player (blink during iframes)
  const blink = S.iframes > 0 && Math.sin(performance.now() / 60) > 0;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.35;
  if (S.boostT > 0) { ctx.shadowColor = '#ffe14d'; }
  else ctx.shadowColor = '#00f6ff';
  ctx.shadowBlur = 22;
  ctx.fillStyle = S.boostT > 0 ? '#fff6c8' : '#e8feff';
  ctx.strokeStyle = S.boostT > 0 ? '#ffe14d' : '#00f6ff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(S.px, S.py - S.pr - 4);
  ctx.lineTo(S.px + S.pr, S.py + S.pr);
  ctx.lineTo(S.px, S.py + S.pr * 0.4);
  ctx.lineTo(S.px - S.pr, S.py + S.pr);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // thrust particles while moving
  if (Math.random() < 0.4 && (keys.size > 0 || S.touchTX !== null)) {
    particles.push({
      x: S.px + (Math.random() - 0.5) * 8, y: S.py + S.pr,
      vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 80,
      life: 0.4, age: 0, color: S.boostT > 0 ? '#ffe14d' : '#00f6ff', size: 2,
    });
  }
}
function renderRunner() {
  const gy = H * 0.78;
  // obstacles
  for (const o of R.obstacles) {
    ctx.save();
    ctx.shadowColor = o.color; ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(10,12,28,.95)';
    ctx.strokeStyle = o.color; ctx.lineWidth = 2;
    if (o.kind === 'high') {
      // gate with legs
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = o.color;
      for (let i = 0; i < o.w; i += 10) {
        const yy = o.y + o.h / 2 + Math.sin(G.bgT * 10 + i) * 3;
        ctx.fillRect(o.x + i, yy, 5, 3);
      }
      ctx.strokeStyle = 'rgba(0,246,255,.7)';
      ctx.fillStyle = 'rgba(0,246,255,.08)';
      ctx.fillRect(o.x + 3, o.y + o.h, 4, gy - (o.y + o.h));
      ctx.fillRect(o.x + o.w - 7, o.y + o.h, 4, gy - (o.y + o.h));
    } else {
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      // hazard stripes
      ctx.fillStyle = o.color;
      for (let y = o.y + 6; y < o.y + o.h - 4; y += 12) {
        ctx.save();
        ctx.beginPath(); ctx.rect(o.x + 2, y, o.w - 4, 5);
        ctx.clip();
        ctx.globalAlpha = 0.8;
        for (let x = -8; x < o.w + 8; x += 12) ctx.fillRect(o.x + x + (y % 24), y, 6, 5);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  // orbs
  const t = performance.now() / 1000;
  for (const o of R.orbItems) {
    const bob = Math.sin(t * 5 + o.x * 0.05) * 3;
    ctx.save();
    ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(o.x, o.y + bob, o.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(o.x - 2, o.y + bob - 2, o.r * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // player
  const curH = R.sliding > 0 ? R.slideH : R.ph;
  const py = R.py + (R.ph - curH); // keep feet planted visually when sliding (R.py tracks standing box; adjust)
  const drawY = R.sliding > 0 ? R.groundY - curH : R.py;
  const cx = R.px + R.pw / 2;
  const blink = R.iframes > 0 && Math.sin(performance.now() / 50) > 0;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.35;
  ctx.shadowColor = '#00f6ff'; ctx.shadowBlur = 20;
  const grad = ctx.createLinearGradient(0, drawY, 0, drawY + curH);
  grad.addColorStop(0, '#00f6ff'); grad.addColorStop(1, '#a855f7');
  ctx.fillStyle = grad;
  // rounded runner body leaning forward
  const w = R.sliding > 0 ? R.pw + 16 : R.pw;
  const x = R.sliding > 0 ? R.px - 8 : R.px;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, drawY, w, curH, 8); else ctx.rect(x, drawY, w, curH);
  ctx.fill();
  ctx.strokeStyle = '#e8feff'; ctx.lineWidth = 2; ctx.stroke();
  // visor
  ctx.shadowBlur = 8; ctx.shadowColor = '#ff2d95';
  ctx.fillStyle = '#ff2d95';
  ctx.fillRect(x + w - 12, drawY + 8, 8, R.sliding > 0 ? 6 : 10);
  // slide sparks / run dust
  ctx.restore();
  if (R.onGround && Math.random() < 0.5) {
    particles.push({
      x: R.px + 4, y: R.groundY,
      vx: -R.speed * 0.3 + (Math.random() - 0.5) * 60, vy: -Math.random() * 120,
      life: 0.35, age: 0, color: '#a855f7', size: 2,
    });
  }
  void py; void cx;
}
function renderParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.shadowColor = p.color; ctx.shadowBlur = 10;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
    ctx.font = 'bold 15px sans-serif';
    ctx.shadowColor = f.color; ctx.shadowBlur = 10;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}
function render() {
  ctx.save();
  if (G.shakeT > 0) {
    const m = G.shakeMag * (G.shakeT / 0.4);
    ctx.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
  }
  drawBackground();
  if (G.mode === 'survival' && G.screen !== 'menu') renderSurvival();
  else if (G.mode === 'runner' && G.screen !== 'menu') renderRunner();
  else {
    // menu attract: drifting orbs
    const t = performance.now() / 1000;
    for (let i = 0; i < 12; i++) {
      const x = (Math.sin(t * 0.4 + i * 2.3) * 0.5 + 0.5) * W;
      const y = (Math.cos(t * 0.3 + i * 1.7) * 0.5 + 0.5) * H;
      drawGlowCircle(x, y, 3, i % 2 ? '#00f6ff' : '#ff2d95', 0.7);
    }
  }
  renderParticles();
  ctx.restore();
}

/* ============ MAIN LOOP (single, never duplicated) ============ */
function loop(now) {
  rafId = requestAnimationFrame(loop);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (!isFinite(dt) || dt < 0) dt = 0.016;
  dt = Math.min(dt, 0.05); // clamp tab-switch jumps
  G.bgT += dt;
  if (G.shakeT > 0) { G.shakeT -= dt; if (G.shakeT <= 0) G.shakeMag = 0; }

  if (G.screen === 'playing') {
    if (G.mode === 'survival') updateSurvival(dt);
    else if (G.mode === 'runner') updateRunner(dt);
    if (G.screen === 'playing') updateHUD();
  } else if (G.screen === 'menu' || G.screen === 'over') {
    updateParticles(dt);
  }
  // paused: freeze everything, still render
  render();
}

/* ============ INPUT ============ */
const keys = new Set();
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (e) => {
  Sfx.ensure();
  if (GAME_KEYS.has(e.code)) e.preventDefault(); // no page scroll
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.screen === 'playing') pauseGame();
    else if (G.screen === 'paused') resumeGame();
  }
  if (e.code === 'Enter') {
    if (G.screen === 'menu') startGame('survival');
    else if (G.screen === 'over') startGame(G.mode || 'survival');
  }
  if (G.screen === 'playing' && G.mode === 'survival' && e.code === 'Space') firePulse();
  if (G.screen === 'playing' && G.mode === 'runner' && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) runnerJump();
  if (G.screen === 'playing' && G.mode === 'runner' && e.code === 'ArrowDown') runnerSlide();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (G.screen === 'playing') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.screen === 'playing') pauseGame(); });

// touch: drag-to-move in survival, tap = pulse via button; tap canvas = jump in runner
let touchId = null;
canvas.addEventListener('pointerdown', (e) => {
  Sfx.ensure();
  if (G.screen !== 'playing') return;
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (G.mode === 'survival') { touchId = e.pointerId; S.touchTX = x; S.touchTY = y; }
  else if (G.mode === 'runner') { runnerJump(); }
});
canvas.addEventListener('pointermove', (e) => {
  if (G.screen !== 'playing' || G.mode !== 'survival' || e.pointerId !== touchId) return;
  const r = canvas.getBoundingClientRect();
  S.touchTX = e.clientX - r.left; S.touchTY = e.clientY - r.top;
});
const endTouch = (e) => { if (e.pointerId === touchId) { touchId = null; } };
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);

function bindHold(btn, down, up) {
  const d = (e) => { e.preventDefault(); Sfx.ensure(); down(); };
  const u = (e) => { if (e) e.preventDefault(); if (up) up(); };
  btn.addEventListener('pointerdown', d);
  btn.addEventListener('pointerup', u);
  btn.addEventListener('pointerleave', u);
}
bindHold(ui.btnJump, () => runnerJump());
bindHold(ui.btnSlide, () => runnerSlide());
bindHold(ui.btnPulse, () => firePulse());

/* ============ BUTTONS ============ */
$('btnSurvival').addEventListener('click', () => startGame('survival'));
$('btnRunner').addEventListener('click', () => startGame('runner'));
$('btnStart').addEventListener('click', () => {
  if (G.screen === 'paused') resumeGame();
  else if (G.screen === 'over') startGame(G.mode || 'survival');
  else if (G.screen === 'menu') startGame(G.mode || 'survival');
  else Sfx.ensure();
});
$('btnPause').addEventListener('click', () => {
  if (G.screen === 'playing') pauseGame();
  else if (G.screen === 'paused') resumeGame();
});
$('btnResume').addEventListener('click', resumeGame);
$('btnRestart').addEventListener('click', () => startGame(G.mode || 'survival'));
$('btnReplay').addEventListener('click', () => startGame(G.mode || 'survival'));
$('btnMenu1').addEventListener('click', toMenu);
$('btnMenu2').addEventListener('click', toMenu);
ui.btnMute.addEventListener('click', () => { Sfx.ensure(); Sfx.setMuted(!muted); });
document.addEventListener('pointerdown', () => Sfx.ensure(), { once: true });

/* ============ BOOT ============ */
refreshBest();
Sfx.setMuted(muted);
resize();
resetSurvival();
G.mode = null; G.screen = 'menu';
show(ui.menu, true); show(ui.hud, false);
setTouchVisible();
if (rafId) cancelAnimationFrame(rafId); // safety: never duplicate
lastTime = performance.now();
rafId = requestAnimationFrame(loop);
// re-fit after fonts/layout settle
setTimeout(resize, 100);
setTimeout(resize, 500);

})();
