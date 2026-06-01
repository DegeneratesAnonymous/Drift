'use strict';

// ── Soft-creature system feature flag ─────────────────────────────────────────
// Set to true to enable the new physics-based creature system alongside the
// existing Drift creatures.  Integration hooks are in the main update/render
// loops below.  The old creature code is NOT removed while this is false.
window.DRIFT_USE_SOFT_CREATURES = true;
// Disable prototype authority: NPC visuals are purely cosmetic proxies driven
// by the legacy simulation.  When true, NPCs run autonomous creature-lab AI
// which causes them to shoot across the map and swim independently of the game.

(() => {

// =============================================================================
// DRIFT — A procedural micro-ecosystem survival game
// =============================================================================

const CFG = window.GAME_CONFIG || {};

// ─────────────────────────────────────────────────────────────────────────────
// TUNING
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  WORLD_RADIUS: 3600,
  CAMERA_LERP: 0.12,
  PLAYER_START_SIZE: 10,
  PLAYER_MAX_SIZE: 60,
  PLAYER_BASE_HP: 100,
  PLAYER_BASE_ENERGY: 100,
  PLAYER_ACCEL: 1100,
  PLAYER_FRICTION: 3.2,
  PLAYER_MAX_SPEED: 170,
  PLAYER_TURN_RATE: 9,
  PLAYER_BITE_DAMAGE: 12,
  PLAYER_DEFENSE: 0,
  DASH_FORCE: 620,
  DASH_ENERGY: 18,
  DASH_COOLDOWN: 0.55,
  DASH_DURATION: 0.16,
  METABOLISM_BASE: 0.55,
  HEAL_RATE: 1.4,
  REGEN_DELAY: 4,
  DETECTION_BASE: 220,
  ENERGY_REGEN_PASSIVE: 0,
  DEATH_HEAL_FOR_KILL: 0.06,
  EAT_HEAL_FRACTION: 0.04,
  FOOD_VALUE_BASIC: 6,
  FOOD_VALUE_RICH: 16,
  FOOD_VALUE_DNA: 0,
  DNA_PER_MUTATION: 12,
  STARTING_DNA: 0,
  MEAT_DECAY_TIME: 40,
  EAT_SPEED_MUL: 0.4,
  PLANT_CAP: 36,
  ROCK_COUNT: 18,
  MATE_RANGE: 55,
  MATE_TIME: 2.2,
  EGG_HATCH_TIME: 5.0,
  ESCORT_RANGE: 260,
  CREATURE_CAP: 200,
  FOOD_CAP: 280,
  HAZARD_CAP: 24,
  SPAWN_RADIUS: 1700,
  DESPAWN_RADIUS: 3200,
  GRID_CELL: 180,
  DT_MAX: 0.05,
  // Feature flag: set true to enable procedural body sim (P1–P5).
  // When false the game renders identically to pre-P0 behaviour.
  PROC_BODY: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES — math, rng, color
// ─────────────────────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const RING_SIZE = 300;
const BIOME_CURRENT_INNER = RING_SIZE * 21;
const BIOME_FOREST_INNER = RING_SIZE * 45;
const BIOME_VENT_INNER = RING_SIZE * 69;
const BIOME_ABYSS_INNER = RING_SIZE * 93;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const angDelta = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };

function rngFromSeed(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9E3779B9;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function rngPick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function rngRange(rng, a, b) { return a + rng() * (b - a); }
function rngInt(rng, a, b) { return Math.floor(a + rng() * (b - a + 1)); }
function rngChance(rng, p) { return rng() < p; }

function hslaCSS(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a})`; }

function shortSeedString(n) { return (n >>> 0).toString(36).toUpperCase().padStart(5, '0').slice(-7); }

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS — rebindable key mappings, persisted to localStorage
// ─────────────────────────────────────────────────────────────────────────────
const Controls = {
  _key: 'drift.micro-eco.v1.keybinds',
  defaults: {
    moveUp:    'w',
    moveDown:  's',
    moveLeft:  'a',
    moveRight: 'd',
    altUp:    'arrowup',
    altDown:  'arrowdown',
    altLeft:  'arrowleft',
    altRight: 'arrowright',
    dash:       'shift',
    slot1:      ' ',
    slot2:      'e',
    slot3:      'q',
    actionMenu: 'x',
  },
  bindings: {},
  load() {
    try {
      const s = localStorage.getItem(this._key);
      const saved = s ? JSON.parse(s) : {};
      this.bindings = Object.assign({}, this.defaults, saved);
    } catch (e) { this.bindings = Object.assign({}, this.defaults); }
  },
  save() {
    try { localStorage.setItem(this._key, JSON.stringify(this.bindings)); } catch (e) {}
  },
  reset() { this.bindings = Object.assign({}, this.defaults); this.save(); },
  bind(action, key) { this.bindings[action] = key.toLowerCase(); this.save(); },
  labelFor(action) {
    const k = (this.bindings[action] || '').toLowerCase();
    const map = { ' ': 'Space', 'arrowup': '↑', 'arrowdown': '↓', 'arrowleft': '←', 'arrowright': '→',
      'shift': 'Shift', 'escape': 'Esc', 'control': 'Ctrl', 'alt': 'Alt', 'enter': 'Enter',
      'backspace': 'Bksp', 'tab': 'Tab' };
    return map[k] || k.toUpperCase() || '—';
  },
};
Controls.load();

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────
const Input = {
  keys: new Set(),
  mouseX: 0,
  mouseY: 0,
  mouseInside: false,
  touchX: 0,
  touchY: 0,
  touchActive: false,
  touchDashPressed: false,
  touchPausePressed: false,
  lastAimX: 1,
  lastAimY: 0,
  isMobile: false,
  dashEdge: false,
  pauseEdge: false,
  actionEdge: { s1: false, s2: false, s3: false },
  actionMenuEdge: false,
  _lastDash: false,
  _lastPause: false,
  _pausePulse: false,
  _lastS1: false, _lastS2: false, _lastS3: false,
  _lastAM: false,

  scrollDelta: 0,

  attach(canvas) {
    this.isMobile = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ' || k === 'spacebar' || k === 'e' || k === 'q' || k === 'x' ||
          k === 'escape' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' ||
          k === 'w' || k === 'a' || k === 's' || k === 'd') {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
      const mx = this.mouseX - canvas.width * 0.5;
      const my = this.mouseY - canvas.height * 0.5;
      const mm = Math.hypot(mx, my);
      if (mm > 1) { this.lastAimX = mx / mm; this.lastAimY = my / mm; }
      this.mouseInside = true;
    });
    canvas.addEventListener('mouseenter', () => { this.mouseInside = true; });
    canvas.addEventListener('mouseleave', () => { this.mouseInside = false; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.scrollDelta += e.deltaY; }, { passive: false });
    window.addEventListener('blur', () => { this.keys.clear(); });

    const stickZone = document.getElementById('mob-stick-zone');
    const stickKnob = document.getElementById('mob-stick-knob');
    const dashBtn = document.getElementById('mob-dash');
    const pauseBtn = document.getElementById('mob-pause');
    if (stickZone && stickKnob) {
      let activeId = null;
      const maxR = 56;
      const resetStick = () => {
        this.touchX = 0;
        this.touchY = 0;
        this.touchActive = false;
        stickKnob.style.transform = 'translate(-50%, -50%)';
      };
      const updateStick = (clientX, clientY) => {
        const r = stickZone.getBoundingClientRect();
        const cx = r.left + r.width * 0.5;
        const cy = r.top + r.height * 0.5;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const m = Math.hypot(dx, dy);
        if (m > maxR) { dx = dx / m * maxR; dy = dy / m * maxR; }
        const nx = dx / maxR;
        const ny = dy / maxR;
        this.touchX = nx;
        this.touchY = ny;
        this.touchActive = Math.hypot(nx, ny) > 0.08;
        if (this.touchActive) {
          const am = Math.hypot(nx, ny) || 1;
          this.lastAimX = nx / am;
          this.lastAimY = ny / am;
        }
        stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      };
      stickZone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        activeId = e.pointerId;
        stickZone.setPointerCapture(activeId);
        updateStick(e.clientX, e.clientY);
      });
      stickZone.addEventListener('pointermove', (e) => {
        if (activeId !== e.pointerId) return;
        e.preventDefault();
        updateStick(e.clientX, e.clientY);
      });
      const releaseStick = (e) => {
        if (activeId !== e.pointerId) return;
        activeId = null;
        resetStick();
      };
      stickZone.addEventListener('pointerup', releaseStick);
      stickZone.addEventListener('pointercancel', releaseStick);
      stickZone.addEventListener('lostpointercapture', () => { activeId = null; resetStick(); });
    }
    if (dashBtn) {
      dashBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.touchDashPressed = true; });
      dashBtn.addEventListener('pointerup', (e) => { e.preventDefault(); this.touchDashPressed = false; });
      dashBtn.addEventListener('pointercancel', () => { this.touchDashPressed = false; });
      dashBtn.addEventListener('lostpointercapture', () => { this.touchDashPressed = false; });
    }
    if (pauseBtn) {
      pauseBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.touchPausePressed = true; });
      pauseBtn.addEventListener('pointerup', (e) => { e.preventDefault(); this.touchPausePressed = false; });
      pauseBtn.addEventListener('pointercancel', () => { this.touchPausePressed = false; });
      pauseBtn.addEventListener('lostpointercapture', () => { this.touchPausePressed = false; });
    }
  },

  tick() {
    const B = Controls.bindings;
    const dash = this.keys.has(B.dash) || this.touchDashPressed;
    this.dashEdge = dash && !this._lastDash;
    this._lastDash = dash;
    // Pause is driven by Escape directly in the game keydown handler; touch pause uses this edge.
    this.pauseEdge = this._pausePulse || (this.touchPausePressed && !this._lastPause);
    this._pausePulse = false;
    this._lastPause = this.touchPausePressed;
    // Action slot edges (Space / E / Q by default, rebindable via Controls).
    const s1 = this.keys.has(B.slot1) || this.keys.has('spacebar');
    this.actionEdge.s1 = s1 && !this._lastS1;
    this._lastS1 = s1;
    const s2 = this.keys.has(B.slot2);
    this.actionEdge.s2 = s2 && !this._lastS2;
    this._lastS2 = s2;
    const s3 = this.keys.has(B.slot3);
    this.actionEdge.s3 = s3 && !this._lastS3;
    this._lastS3 = s3;
    const am = this.keys.has(B.actionMenu);
    this.actionMenuEdge = am && !this._lastAM;
    this._lastAM = am;
  },

  axis() {
    if (this.touchActive) return [this.touchX, this.touchY];
    let x = 0, y = 0;
    const B = Controls.bindings;
    if (this.keys.has(B.moveLeft) || this.keys.has(B.altLeft))   x -= 1;
    if (this.keys.has(B.moveRight) || this.keys.has(B.altRight)) x += 1;
    if (this.keys.has(B.moveUp) || this.keys.has(B.altUp))       y -= 1;
    if (this.keys.has(B.moveDown) || this.keys.has(B.altDown))   y += 1;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    if (m > 0.001) { this.lastAimX = x / m; this.lastAimY = y / m; }
    return [x, y];
  },

  aimDir(canvas) {
    if (this.mouseInside) {
      const mx = this.mouseX - canvas.width * 0.5;
      const my = this.mouseY - canvas.height * 0.5;
      const mm = Math.hypot(mx, my) || 1;
      return [mx / mm, my / mm];
    }
    const m = Math.hypot(this.lastAimX, this.lastAimY) || 1;
    return [this.lastAimX / m, this.lastAimY / m];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO — procedural via WebAudio
// ─────────────────────────────────────────────────────────────────────────────
const Audio = {
  ctx: null,
  master: null,
  enabled: false,
  ambient: null,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* no audio */ }
  },

  enable() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.enabled = true;
    this.startAmbient();
  },

  disable() {
    this.enabled = false;
    this.stopAmbient();
  },

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.3;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 6;
    lfo.connect(lfoGain).connect(o1.frequency);
    const g = ctx.createGain(); g.gain.value = 0.0;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 380;
    o1.connect(g); o2.connect(g);
    g.connect(filt); filt.connect(this.master);
    o1.start(); o2.start(); lfo.start();
    g.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 2);
    this.ambient = { o1, o2, lfo, g };
  },

  stopAmbient() {
    if (!this.ambient) return;
    const { o1, o2, lfo, g } = this.ambient;
    const ctx = this.ctx;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    setTimeout(() => { try { o1.stop(); o2.stop(); lfo.stop(); } catch(e){} }, 600);
    this.ambient = null;
  },

  blip(freq, dur = 0.08, type = 'sine', vol = 0.18) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(this.master);
    o.start(now); o.stop(now + dur + 0.02);
  },

  sweep(f1, f2, dur, vol = 0.16) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(f1, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f2), now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(this.master);
    o.start(now); o.stop(now + dur + 0.02);
  },

  noise(dur = 0.12, vol = 0.14, cutoff = 1800) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(now);
  },

  eat()      { this.blip(540 + Math.random() * 120, 0.07, 'sine', 0.16); },
  meatEat()  { this.blip(220 + Math.random() * 40, 0.14, 'sawtooth', 0.14); this.noise(0.08, 0.08, 600); },
  dna()      { this.blip(880, 0.12, 'triangle', 0.22); setTimeout(() => this.blip(1320, 0.12, 'sine', 0.18), 80); },
  dash()     { this.sweep(220, 480, 0.18, 0.14); },
  hurt()     { this.noise(0.16, 0.18, 900); this.blip(120, 0.14, 'sawtooth', 0.12); },
  kill()     { this.sweep(380, 110, 0.28, 0.18); this.noise(0.18, 0.10, 600); },
  threat()   { this.blip(180, 0.22, 'triangle', 0.10); },
  mutation() { this.sweep(440, 880, 0.5, 0.18); setTimeout(() => this.sweep(660, 1100, 0.4, 0.14), 200); },
  death()    { this.sweep(220, 50, 1.2, 0.24); this.noise(0.8, 0.16, 400); },
  event()    { this.blip(660, 0.2, 'triangle', 0.16); setTimeout(() => this.blip(990, 0.3, 'sine', 0.14), 140); },
};

// ─────────────────────────────────────────────────────────────────────────────
// SPATIAL GRID — for neighbor queries
// ─────────────────────────────────────────────────────────────────────────────
class SpatialGrid {
  constructor(cell) { this.cell = cell; this.cells = new Map(); }
  clear() { this.cells.clear(); }
  _key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
  insert(e) {
    const cx = Math.floor(e.x / this.cell);
    const cy = Math.floor(e.y / this.cell);
    const k = this._key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) { bucket = []; this.cells.set(k, bucket); }
    bucket.push(e);
  }
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const cx0 = Math.floor((x - r) / c);
    const cy0 = Math.floor((y - r) / c);
    const cx1 = Math.floor((x + r) / c);
    const cy1 = Math.floor((y + r) / c);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLES — pooled
// ─────────────────────────────────────────────────────────────────────────────
class ParticlePool {
  constructor(cap = 600) {
    this.cap = cap;
    this.list = [];
    for (let i = 0; i < cap; i++) this.list.push({ alive: false, x:0, y:0, vx:0, vy:0, life:0, max:0, r:1, h:200, s:80, l:80, a:1, g:0 });
    this.head = 0;
  }
  spawn(x, y, vx, vy, life, r, h, s, l, a = 1, g = 0) {
    let p;
    for (let i = 0; i < this.cap; i++) {
      const idx = (this.head + i) % this.cap;
      if (!this.list[idx].alive) { p = this.list[idx]; this.head = (idx + 1) % this.cap; break; }
    }
    if (!p) p = this.list[this.head]; // overwrite
    p.alive = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.r = r; p.h = h; p.s = s; p.l = l; p.a = a; p.g = g;
  }
  burst(x, y, n, opts) {
    const { speed = 60, life = 0.7, r = 2, h = 200, s = 80, l = 75 } = opts || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = speed * (0.4 + Math.random() * 1.0);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * (0.7 + Math.random() * 0.6), r, h, s, l);
    }
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      const p = this.list[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= (1 - 1.2 * dt); p.vy *= (1 - 1.2 * dt);
      if (p.g) p.vy += p.g * dt;
    }
  }
  draw(ctx, camX, camY, w, h) {
    for (let i = 0; i < this.cap; i++) {
      const p = this.list[i];
      if (!p.alive) continue;
      const sx = p.x - camX + w * 0.5;
      const sy = p.y - camY + h * 0.5;
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      const t = p.life / p.max;
      ctx.fillStyle = hslaCSS(p.h, p.s, p.l, p.a * t);
      ctx.beginPath();
      ctx.arc(sx, sy, p.r * (0.6 + 0.6 * t), 0, TAU);
      ctx.fill();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BIOMES — radial zones around origin
// ─────────────────────────────────────────────────────────────────────────────
const BIOMES = [
  {
    id: 'bloom', name: 'Primordial Bloom', tier: 'I · SAFE',
    inner: 0, outer: BIOME_CURRENT_INNER,
    bgInner: [195, 60, 14], bgOuter: [205, 50, 7],
    palette: { huePri: 180, hueAlt: 140, sat: 60 },
    nutrientRate: 1.6, nutrientH: 60, nutrientS: 90, nutrientL: 75,
    creatureTemplates: ['drifter', 'grazer', 'swarmer'],
    apex: false,
    description: 'Nutrient-rich, warm light. Few real threats.'
  },
  {
    id: 'current', name: 'Competitive Current', tier: 'II · CONTESTED',
    inner: BIOME_CURRENT_INNER, outer: BIOME_FOREST_INNER,
    bgInner: [200, 55, 11], bgOuter: [210, 55, 6],
    palette: { huePri: 200, hueAlt: 50, sat: 70 },
    nutrientRate: 1.1, nutrientH: 50, nutrientS: 80, nutrientL: 70,
    creatureTemplates: ['drifter', 'grazer', 'swarmer', 'darter', 'small_hunter'],
    apex: false,
    description: 'Fast prey, opportunistic hunters, drifting currents.'
  },
  {
    id: 'forest', name: 'Bacterial Forest', tier: 'III · DENSE',
    inner: BIOME_FOREST_INNER, outer: BIOME_VENT_INNER,
    bgInner: [115, 45, 9], bgOuter: [140, 40, 5],
    palette: { huePri: 110, hueAlt: 30, sat: 65 },
    nutrientRate: 0.9, nutrientH: 95, nutrientS: 75, nutrientL: 65,
    creatureTemplates: ['grazer', 'darter', 'small_hunter', 'ambusher', 'territorial'],
    apex: false,
    description: 'Tangled growth. Things hide in the green.'
  },
  {
    id: 'vent', name: 'Thermal Vent Field', tier: 'IV · HOSTILE',
    inner: BIOME_VENT_INNER, outer: BIOME_ABYSS_INNER,
    bgInner: [20, 55, 11], bgOuter: [350, 45, 5],
    palette: { huePri: 20, hueAlt: 340, sat: 80 },
    nutrientRate: 0.7, nutrientH: 30, nutrientS: 85, nutrientL: 60,
    creatureTemplates: ['armored', 'small_hunter', 'ambusher', 'territorial', 'scavenger'],
    apex: true,
    hazards: ['vent', 'toxic'],
    description: 'Heat plumes and armored predators. Rare DNA bursts.'
  },
  {
    id: 'abyss', name: 'Abyssal Dark', tier: 'V · LETHAL',
    inner: BIOME_ABYSS_INNER, outer: Infinity,
    bgInner: [240, 40, 4], bgOuter: [260, 30, 2],
    palette: { huePri: 280, hueAlt: 190, sat: 70 },
    nutrientRate: 0.45, nutrientH: 280, nutrientS: 70, nutrientL: 70,
    creatureTemplates: ['scavenger', 'ambusher', 'apex', 'parasite'],
    apex: true,
    hazards: ['dark', 'toxic'],
    description: 'No light reaches here. The huge things wait.'
  }
];

function biomeAt(r) {
  for (let i = 0; i < BIOMES.length; i++) {
    if (r >= BIOMES[i].inner && r < BIOMES[i].outer) return BIOMES[i];
  }
  return BIOMES[BIOMES.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS — every one has a benefit and a cost
// ─────────────────────────────────────────────────────────────────────────────
// stat keys: speedMul, accelMul, hpMax, energyMax, sizeMul, biteMul, defense,
//   detectionMul, metabMul, stealthMul, dashMul, dashCostMul, healMul,
//   intimidate, lureRange, scavengerBonus, parasiteResist, filter
const MUTATIONS = [
  {
    id: 'spikes', name: 'Bone Spikes', icon: 'spikes',
    benefit: 'Attackers take recoil damage.',
    cost:    'Lower maneuverability.',
    flavor: 'Hard, brittle, deterring.',
    apply(p) { p.spikeDamage = (p.spikeDamage || 0) + 8; p.stats.turnMul *= 0.85; },
    weight: 1
  },
  {
    id: 'armor', name: 'Carapace', icon: 'plates',
    benefit: '+25% defense.',
    cost:    '−12% speed.',
    flavor: 'Layered chitin plates harden along the flank.',
    apply(p) { p.stats.defense += 25; p.stats.speedMul *= 0.88; },
    weight: 1
  },
  {
    id: 'eyes', name: 'Compound Eyes', icon: 'eyes',
    benefit: '+45% detection range.',
    cost:    '+15% metabolism.',
    flavor: 'You see them coming — and burn fuel for the privilege.',
    apply(p) { p.stats.detectionMul *= 1.45; p.stats.metabMul *= 1.15; },
    weight: 1
  },
  {
    id: 'glow', name: 'Bioluminescence', icon: 'glow',
    benefit: 'Lures small prey toward you.',
    cost:    'Predators detect you farther.',
    flavor: 'Light is a promise. Sometimes kept.',
    apply(p) { p.lure = (p.lure || 0) + 220; p.visibilityMul = (p.visibilityMul || 1) * 1.4; },
    weight: 1
  },
  {
    id: 'jet', name: 'Jet Gland', icon: 'jet',
    benefit: 'Dash is 35% stronger.',
    cost:    'Dash costs 40% more energy.',
    flavor: 'A spasm of propulsion.',
    apply(p) { p.stats.dashMul *= 1.35; p.stats.dashCostMul *= 1.4; },
    weight: 1
  },
  {
    id: 'venom', name: 'Venom Sac', icon: 'venom',
    benefit: 'Bites apply damage over time.',
    cost:    'Direct bite damage reduced 20%.',
    flavor: 'Slow ruin instead of clean kill.',
    apply(p) { p.venomDPS = (p.venomDPS || 0) + 7; p.venomDur = Math.max(p.venomDur || 0, 3.5); p.stats.biteMul *= 0.8; },
    weight: 1
  },
  {
    id: 'filter', name: 'Filter Gills', icon: 'filter',
    benefit: 'Passive nutrient gain near food clouds.',
    cost:    '−25% bite damage.',
    flavor: 'Strain the current for survival.',
    apply(p) { p.filter = (p.filter || 0) + 6; p.stats.biteMul *= 0.75; },
    weight: 1
  },
  {
    id: 'mandibles', name: 'Mandibles', icon: 'mandibles',
    benefit: '+50% bite damage.',
    cost:    '−18% turn rate.',
    flavor: 'A face becomes a weapon.',
    apply(p) { p.stats.biteMul *= 1.5; p.stats.turnMul *= 0.82; },
    weight: 1
  },
  {
    id: 'fins', name: 'Pelagic Fins', icon: 'fins',
    benefit: '+22% top speed.',
    cost:    '−15% defense.',
    flavor: 'Cut water like memory.',
    apply(p) { p.stats.speedMul *= 1.22; p.stats.defense = Math.max(0, p.stats.defense - 15); },
    weight: 1
  },
  {
    id: 'camo', name: 'Camouflage Membrane', icon: 'camo',
    benefit: 'Predators see you 40% less.',
    cost:    'Your own UI feedback dims.',
    flavor: 'Vanish, mostly.',
    apply(p) { p.stats.stealthMul *= 0.6; p.uiDim = true; },
    weight: 1
  },
  {
    id: 'metabolism', name: 'Slow Metabolism', icon: 'meta',
    benefit: '−35% energy use.',
    cost:    'Heal 25% slower.',
    flavor: 'Patience is a kind of fuel.',
    apply(p) { p.stats.metabMul *= 0.65; p.stats.healMul *= 0.75; },
    weight: 1
  },
  {
    id: 'gut', name: 'Expanded Gut', icon: 'gut',
    benefit: '+40 max energy capacity.',
    cost:    '+8% body size (you become a bigger target).',
    flavor: 'Hold more, weigh more.',
    apply(p) { p.stats.energyMax += 40; p.stats.sizeMul *= 1.08; },
    weight: 1
  },
  {
    id: 'plates', name: 'Calcified Shell', icon: 'shell',
    benefit: '+40 max health.',
    cost:    '−18% acceleration.',
    flavor: 'Slow to start. Hard to stop. Hard to crack.',
    apply(p) { p.stats.hpMax += 40; p.stats.accelMul *= 0.82; },
    weight: 1
  },
  {
    id: 'predator_sense', name: 'Predator Sense', icon: 'sense',
    benefit: 'Warns earlier of nearby threats.',
    cost:    '+10% metabolism.',
    flavor: 'A new kind of fear, sharpened.',
    apply(p) { p.predatorSense = (p.predatorSense || 1) * 1.7; p.stats.metabMul *= 1.1; },
    weight: 1
  },
  {
    id: 'pack', name: 'Pheromone Glands', icon: 'phero',
    benefit: 'Small prey panic at your approach.',
    cost:    'Territorial creatures attack on sight.',
    flavor: 'A presence in the water.',
    apply(p) { p.intimidate = (p.intimidate || 1) * 1.8; p.provokes = true; },
    weight: 1
  },
  {
    id: 'carnivore', name: 'Apex Predator Gland', icon: 'fang',
    benefit: 'Kills drop rich meat clusters. Meat eaten 2× faster.',
    cost:    'Cannot digest nutrients. Triggers territorial hostility.',
    flavor: 'The current fears you now.',
    apply(p) { p.diet = 'carnivore'; p.provokes = true; p.intimidate = (p.intimidate || 1) * 1.6; },
    weight: 1,
    biomeMin: 2,
  },
  {
    id: 'herbivore_gut', name: 'Chloroplast Lining', icon: 'leaf',
    benefit: 'Plant clusters give 3× energy. Passive regen near plants.',
    cost:    'Meat digests at 10% efficiency.',
    flavor: 'Grow toward the light you cannot see.',
    apply(p) { p.diet = 'herbivore'; p.herbivoreRegen = true; },
    weight: 1,
    biomeMin: 0,
  },
];

const MUTATION_BY_ID = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));

// ─────────────────────────────────────────────────────────────────────────────
// PROPULSION PROFILES — four ways creatures move themselves through water.
//   burst   → charge silently, fire a short hard impulse, then coast
//   glide   → continuous low-effort cruise, very little drag
//   wriggle → sinusoidal tail-driven thrust, steady cadence
//   fin     → continuous steady thrust, the closest analogue to "powered swim"
// All profiles share a unified turn-then-thrust physics; only the thrust
// envelope, drag, and turn rate differ. Speed/accel/turn are further scaled by
// `growthLevel` (slower at level 0) and `bonusComplexity` (DNA upgrades).
// ─────────────────────────────────────────────────────────────────────────────
const PROPULSION_PROFILES = {
  burst: {
    // Short cycle keeps velocity from fully dropping between strikes (which
    // previously made the visual heading mode-switch every coast → reading as
    // a slow-FPS "flip"). A small cruise term means the creature still glides
    // forward between strikes instead of fully stopping.
    cycle: 1.05, burstFrac: 0.28,
    burstStrength: 3.6, cruiseStrength: 0.18,
    turnRate: 2.4, drag: 0.75, slipDamp: 4.0,
  },
  glide: {
    cycle: 0, burstFrac: 0,
    burstStrength: 1.0, cruiseStrength: 0.9,
    turnRate: 3.0, drag: 1.05, slipDamp: 3.5,
  },
  wriggle: {
    cycle: 0.55, burstFrac: 0.55,
    burstStrength: 1.7, cruiseStrength: 0.7,
    turnRate: 4.2, drag: 1.4, slipDamp: 5.5,
  },
  fin: {
    cycle: 0, burstFrac: 0,
    burstStrength: 1.0, cruiseStrength: 1.05,
    turnRate: 5.0, drag: 1.4, slipDamp: 5.0,
  },
};

const TEMPLATE_PROPULSION = {
  drifter:      'glide',
  grazer:       'glide',
  swarmer:      'wriggle',
  darter:       'burst',
  small_hunter: 'fin',
  ambusher:     'burst',
  territorial:  'fin',
  scavenger:    'glide',
  armored:      'fin',
  apex:         'wriggle',
  parasite:     'wriggle',
};

// Growth-level + DNA scaling. Level 0 = visibly slower than adult but still
// clearly swimming (0.72×); each level adds ~6% and each bonusComplexity
// (DNA-equivalent upgrade) adds 4%. Caps around ~1.3× at high growth.
function creatureGrowthMul(c) {
  const lv = (c && c.growthLevel) || 0;
  const dna = (c && c.bonusComplexity) || 0;
  return 0.72 + lv * 0.06 + dna * 0.04;
}

// Centralized growth-level thresholds, exposed on `window` so the dev menu
// can mutate them at runtime and so the upcoming plant system can read the
// same values (chunk-eat tier, leaf-eat tier, etc.).
window.GROWTH_THRESHOLDS = window.GROWTH_THRESHOLDS || {
  npcMateMin:      3, // NPC needs this growth level before reproducing
  // Keep default at 0 so herbivore starts are never soft-locked out of food.
  // Designers can still raise this live from the dev menu.
  plantChunkEat:   0, // growth needed to consume loose plant chunks
  plantLeafEat:    3, // future plant system: growth needed to consume leaves
  plantNodeEat:    7, // future plant system: growth needed to consume nodes
  branchPushable:  3, // future plant system: branch tier that becomes pushable
  subbranchTier:   3, // future plant system: tier above which subbranches can spawn
};

// Maps the player's creator body-shape choice to a creature template so
// hatched offspring/escorts share the player's species archetype. Diet is
// honored where possible by picking a matching herbivore/carnivore variant.
function templateForPlayerSpecies(p) {
  const body = (p && p.creatorBody) || 'round';
  const diet = (p && p.diet) || 'omnivore';
  const carnivore = diet === 'carnivore';
  // round → grazer / territorial
  // oval  → swarmer / darter
  // long  → apex / parasite (small) — use small_hunter for carnivore
  // soft  → drifter (fits both diets)
  let id;
  if (body === 'long')      id = carnivore ? 'small_hunter' : 'grazer';
  else if (body === 'oval') id = carnivore ? 'darter'       : 'swarmer';
  else if (body === 'soft') id = 'drifter';
  else /* round */          id = carnivore ? 'territorial'  : 'grazer';
  return CREATURE_TEMPLATES[id] || CREATURE_TEMPLATES.drifter;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATURE TEMPLATES — base archetypes; visuals & stats roll procedurally
// ─────────────────────────────────────────────────────────────────────────────
const CREATURE_TEMPLATES = {
  drifter: {
    id: 'drifter', name: 'Drifter',
    behavior: 'wander', sizeRange: [4, 9], speed: 12, accel: 30,
    hpMul: 0.6, biteDmg: 2, aggression: 0, fearMul: 1.2, hunger: 0.3,
    body: 'soft', parts: ['cilia'], huesShift: 0, swarmy: false,
    food: 'nutrient', xp: 1, diet: 'omnivore'
  },
  grazer: {
    id: 'grazer', name: 'Grazer',
    behavior: 'graze', sizeRange: [6, 11], speed: 22, accel: 55,
    hpMul: 0.9, biteDmg: 3, aggression: 0, fearMul: 1.0, hunger: 0.5,
    body: 'round', parts: ['cilia', 'eyespot'], huesShift: 20, swarmy: false,
    food: 'nutrient', xp: 2, diet: 'herbivore'
  },
  swarmer: {
    id: 'swarmer', name: 'Swarmer',
    behavior: 'swarm', sizeRange: [3, 5], speed: 36, accel: 92,
    hpMul: 0.4, biteDmg: 4, aggression: 0.5, fearMul: 0.5, hunger: 0.6,
    body: 'oval', parts: ['tail'], huesShift: -10, swarmy: true,
    food: 'nutrient', xp: 1, diet: 'omnivore'
  },
  darter: {
    id: 'darter', name: 'Darter',
    behavior: 'darter', sizeRange: [7, 12], speed: 52, accel: 130,
    hpMul: 0.7, biteDmg: 6, aggression: 0.3, fearMul: 0.8, hunger: 0.5,
    body: 'oval', parts: ['tail', 'eyespot'], huesShift: 30, swarmy: false,
    food: 'meat_small', xp: 3, diet: 'carnivore'
  },
  small_hunter: {
    id: 'small_hunter', name: 'Hunter',
    behavior: 'hunt', sizeRange: [10, 16], speed: 36, accel: 92,
    hpMul: 1.2, biteDmg: 10, aggression: 0.7, fearMul: 0.7, hunger: 0.7,
    body: 'oval', parts: ['tail', 'eyespot', 'fin'], huesShift: 0, swarmy: false,
    food: 'meat_small', xp: 5, diet: 'carnivore'
  },
  ambusher: {
    id: 'ambusher', name: 'Lurker',
    behavior: 'ambush', sizeRange: [11, 18], speed: 21, accel: 160,
    hpMul: 1.4, biteDmg: 16, aggression: 0.9, fearMul: 0.4, hunger: 0.6,
    body: 'long', parts: ['spike', 'eyespot'], huesShift: -30, swarmy: false,
    food: 'meat_small', xp: 6, diet: 'carnivore'
  },
  territorial: {
    id: 'territorial', name: 'Sentinel',
    behavior: 'territorial', sizeRange: [12, 20], speed: 24, accel: 76,
    hpMul: 1.5, biteDmg: 12, aggression: 0.95, fearMul: 0.5, hunger: 0.3,
    body: 'round', parts: ['spike', 'spike', 'eyespot'], huesShift: 10, swarmy: false,
    food: 'meat_small', xp: 7, diet: 'omnivore'
  },
  scavenger: {
    id: 'scavenger', name: 'Scavenger',
    behavior: 'scavenge', sizeRange: [9, 14], speed: 30, accel: 76,
    hpMul: 0.8, biteDmg: 5, aggression: 0.2, fearMul: 0.9, hunger: 0.8,
    body: 'oval', parts: ['tail', 'eyespot'], huesShift: 40, swarmy: false,
    food: 'meat_any', xp: 3, diet: 'omnivore'
  },
  armored: {
    id: 'armored', name: 'Plated One',
    behavior: 'territorial', sizeRange: [14, 22], speed: 18, accel: 56,
    hpMul: 2.2, biteDmg: 14, aggression: 0.7, fearMul: 0.3, hunger: 0.4,
    body: 'round', parts: ['plate', 'plate', 'eyespot'], huesShift: 20, swarmy: false,
    food: 'nutrient', xp: 8, diet: 'herbivore'
  },
  apex: {
    id: 'apex', name: 'Devourer',
    behavior: 'hunt', sizeRange: [22, 38], speed: 38, accel: 108,
    hpMul: 3.0, biteDmg: 32, aggression: 1.0, fearMul: 0.2, hunger: 0.6,
    body: 'long', parts: ['tail', 'fin', 'eyespot', 'mandible'], huesShift: -20, swarmy: false,
    food: 'meat_small', xp: 18, diet: 'carnivore'
  },
  parasite: {
    id: 'parasite', name: 'Parasite',
    behavior: 'parasite', sizeRange: [4, 7], speed: 45, accel: 118,
    hpMul: 0.3, biteDmg: 3, aggression: 0.6, fearMul: 0.6, hunger: 0.9,
    body: 'oval', parts: ['spike'], huesShift: 60, swarmy: false,
    food: 'meat_any', xp: 2, diet: 'carnivore'
  },
};

// Legendary procedurally generated rare organisms
const LEGENDARY_BASES = [
  { name: 'Glass Maw',        templ: 'apex',       sizeBoost: 1.4, hueShift: 200, behaviorMod: 'patrol',  unique: 'glass' },
  { name: 'Blind Lantern',    templ: 'ambusher',   sizeBoost: 1.6, hueShift: 50,  behaviorMod: 'lure',    unique: 'lantern' },
  { name: 'Red Coil',         templ: 'apex',       sizeBoost: 1.2, hueShift: 0,   behaviorMod: 'patrol',  unique: 'coil' },
  { name: 'Many-Eyed Drifter',templ: 'territorial',sizeBoost: 1.3, hueShift: 280, behaviorMod: 'stalk',   unique: 'many_eyed' },
  { name: 'Pale Devourer',    templ: 'apex',       sizeBoost: 1.5, hueShift: 30,  behaviorMod: 'patrol',  unique: 'pale' },
];

// Procedural creature naming
const NAME_PREFIX = ['Eo', 'Cryo', 'Pyr', 'Thal', 'Lum', 'Ne', 'Xyl', 'Pleo', 'Sca', 'Vor', 'Hex', 'Ar', 'My', 'Pro', 'Acan'];
const NAME_MID = ['cyt', 'phag', 'derm', 'plast', 'fil', 'sept', 'cor', 'rhab', 'mer', 'troph'];
const NAME_SUFFIX = ['us', 'a', 'on', 'is', 'ax', 'or', 'ium', 'ella'];
function genCreatureName(rng) {
  return rngPick(rng, NAME_PREFIX) + rngPick(rng, NAME_MID) + rngPick(rng, NAME_SUFFIX);
}

function validateCreaturePartVisuals() {
  const supported = new Set(['cilia', 'tail', 'eyespot', 'spike', 'plate', 'fin', 'mandible', 'filtermouth', 'frill', 'tendril']);
  const referenced = new Set(['frill', 'tendril']);
  for (const id of Object.keys(CREATURE_TEMPLATES)) {
    const t = CREATURE_TEMPLATES[id];
    for (const p of t.parts || []) referenced.add(p);
  }
  const missing = Array.from(referenced).filter((p) => !supported.has(p));
  if (missing.length > 0) {
    console.warn('[Drift] Missing creature part renderers:', missing.join(', '));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY BASE
// ─────────────────────────────────────────────────────────────────────────────
class Entity {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 4;
    this.angle = 0;
    this.dead = false;
    this.kind = 'entity';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER
// ─────────────────────────────────────────────────────────────────────────────
class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.kind = 'player';
    this.r = T.PLAYER_START_SIZE;
    this.stats = {
      hpMax: T.PLAYER_BASE_HP,
      energyMax: T.PLAYER_BASE_ENERGY,
      speedMul: 1, accelMul: 1, sizeMul: 1, biteMul: 1,
      detectionMul: 1, metabMul: 1, stealthMul: 1, dashMul: 1, dashCostMul: 1,
      healMul: 1, turnMul: 1, defense: 0,
    };
    this.hp = this.stats.hpMax;
    this.energy = this.stats.energyMax;
    this.mutations = [];
    this.dna = T.STARTING_DNA;
    this.kills = 0;
    this.eaten = 0;
    this.eatenSpecies = {};
    this.evolvedParts = [];
    this.dashTimer = 0;
    this.dashCD = 0;
    this.eatGlow = 0;
    this.damageGlow = 0;
    this.timeSinceDamage = 99;
    this.dead = false;
    this.deathCause = null;
    this.spikeDamage = 0;
    this.venomDPS = 0;
    this.venomDur = 0;
    this.lure = 0;
    this.filter = 0;
    this.predatorSense = 1;
    this.intimidate = 1;
    this.uiDim = false;
    this.provokes = false;
    this.visibilityMul = 1;
    this.diet = 'omnivore'; // 'herbivore' | 'omnivore' | 'carnivore'
    this.omnivoreUnlocked = false;
    this.omnivoreMilestoneReached = false;
    this.omnivoreDeferred = false;
    this.omnivoreAbyssPrompted = false;
    this.foodMilestonePoints = 0;
    this.mutationUnlockTokens = 0;
    this.speciesTag = 'round:omnivore';
    this.herbivoreRegen = false;
    this.starveSizeFloorMul = 0.58;
    // Player shares the creature growth-level mechanic: starts at 0, advances
    // as the player gains size. Drives speed/accel/turn scaling via
    // creatureGrowthMul() — same formula NPCs use.
    this.growthLevel = 0;
    this.bonusComplexity = 0;
    // Player uses 'fin' propulsion conceptually (steady continuous swim).
    // Movement code reads stats directly rather than the profile, but having
    // the field keeps the player consistent with creature data.
    this.propulsion = 'fin';
    this.eatTarget = null;
    this.eatTimer = 0;
    this.eatDuration = 0;
    this.bumpBiteCD = 0;
    this.politeBubbleT = 0;
    this.politeBubbleText = '';
    this.politeBubbleCD = 0;
    this.dashTrailT = 0;
    this.totalTime = 0;
    this.maxSizeReached = this.r;
    this.deepestRadius = 0;
    this.dnaLifetime = 0;
    this.species = {};
    // mating
    this.mateTarget = null;
    this.mateT = 0;
    this.mating = false;       // mid-mating animation
    this.hatching = false;     // inside egg
    this.hatchT = 0;
    this.eggX = 0; this.eggY = 0;
    this.eggCracks = [];
    this.escortA = null;       // old self
    this.escortB = null;       // mother
  }

  // Speed/accel are scaled by the same growth-mul NPCs use, so a level-0
  // player is visibly sluggish and grows into their full ability — matching
  // the creature growth mechanic.
  get speed()      { return T.PLAYER_MAX_SPEED * this.stats.speedMul * creatureGrowthMul(this); }
  get accel()      { return T.PLAYER_ACCEL * this.stats.accelMul * creatureGrowthMul(this); }
  get detection()  { return T.DETECTION_BASE * this.stats.detectionMul; }
  get biteDamage() { return T.PLAYER_BITE_DAMAGE * this.stats.biteMul * (1 + (this.r - T.PLAYER_START_SIZE) * 0.04); }

  // Player growth-level mirrors how NPCs track it: based on size relative to
  // start. ~1.25 size units per level, capped at 9. Called every frame.
  _refreshPlayerGrowthLevel() {
    const lv = Math.max(0, Math.min(9,
      Math.floor((this.r - T.PLAYER_START_SIZE) / 1.25)));
    if (lv !== this.growthLevel) {
      const grew = lv > this.growthLevel;
      this.growthLevel = lv;
      if (grew) this.growthPulse = Math.min(1.4, (this.growthPulse || 0) + 0.5);
    }
    // DNA/mutation bonus mirrors NPC bonusComplexity: count of mutations.
    this.bonusComplexity = (this.mutations && this.mutations.length) || 0;
  }

  applyMutation(m) {
    if (this.mutations.includes(m.id)) return;
    this.mutations.push(m.id);
    m.apply(this);
    this.speciesTag = `${this.creatorBody}:${this.diet}`;
    this.hp = Math.min(this.hp + 20, this.stats.hpMax);
    this.energy = Math.min(this.energy + 20, this.stats.energyMax);
  }

  takeDamage(amount, source, game = null) {
    const reduced = amount * Math.max(0.2, 1 - this.stats.defense / 100);
    this.hp -= reduced;
    this.timeSinceDamage = 0;
    this.damageGlow = Math.min(1.4, this.damageGlow + 1.0);
    if (game && game.particles) {
      game.particles.burst(this.x, this.y, 10, { speed: 135, life: 0.42, r: 1.9, h: 0, s: 88, l: 66 });
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deathCause = source || 'Consumed';
    }
  }

  update(dt, game) {
    if (this.dead) return;
    this._refreshPlayerGrowthLevel();
    this.totalTime += dt;
    this.timeSinceDamage += dt;
    this.dashCD = Math.max(0, this.dashCD - dt);
    this.bumpBiteCD = Math.max(0, this.bumpBiteCD - dt);
    this.politeBubbleCD = Math.max(0, this.politeBubbleCD - dt);
    if (this.dashTimer > 0) this.dashTimer -= dt;
    this.dashTrailT = Math.max(0, this.dashTrailT - dt);
    this.politeBubbleT = Math.max(0, this.politeBubbleT - dt);
    this.eatGlow = Math.max(0, this.eatGlow - dt * 2);
    this.damageGlow = Math.max(0, this.damageGlow - dt * 1.5);

    // eat timer — player is mid-consume
    if (this.eatTimer > 0) {
      this.eatTimer -= dt;
      if (this.eatTimer <= 0 && this.eatTarget && !this.eatTarget.dead) {
        if (this.eatTarget.kind === 'food') {
          game.eatFood(this.eatTarget);
          this.eatTarget.dead = true;
        } else if (this.eatTarget.kind === 'creature') {
          game.consumeCreature(this.eatTarget);
          this.eatTarget.dead = true;
          this.eatTarget.deathT = 0;
        }
        this.eatTarget = null;
      }
    }
    const eating = this.eatTimer > 0;

    // Lock in egg during hatching
    if (this.hatching) {
      this.x = this.eggX; this.y = this.eggY;
      this.vx = 0; this.vy = 0;
      return;
    }

    const [ax, ay] = Input.axis();
    const accel = this.accel * (eating ? T.EAT_SPEED_MUL : 1);
    this.vx += ax * accel * dt;
    this.vy += ay * accel * dt;

    const friction = Math.max(0, 1 - T.PLAYER_FRICTION * dt);
    this.vx *= friction;
    this.vy *= friction;

    // Subtle environmental current influence while swimming.
    const cur = game.getCurrentVectorAt(this.x, this.y);
    this.vx += cur.x * dt * 0.16;
    this.vy += cur.y * dt * 0.16;

    // dash
    if (Input.dashEdge && this.dashCD <= 0 && this.energy >= T.DASH_ENERGY * this.stats.dashCostMul) {
      const m = Math.hypot(this.vx, this.vy);
      let dx, dy;
      if (m > 10) { dx = this.vx / m; dy = this.vy / m; }
      else if (ax || ay) { dx = ax; dy = ay; }
      else {
        const aim = Input.aimDir(game.canvas);
        dx = aim[0];
        dy = aim[1];
      }
      const force = T.DASH_FORCE * this.stats.dashMul;
      this.vx += dx * force;
      this.vy += dy * force;
      this.dashTimer = T.DASH_DURATION;
      this.dashCD = T.DASH_COOLDOWN;
      this.energy -= T.DASH_ENERGY * this.stats.dashCostMul;
      game.particles.burst(this.x, this.y, 14, { speed: 220, life: 0.5, r: 2, h: 190, s: 80, l: 80 });
      Audio.dash();
    }

    // clamp speed (allow brief dash overshoot)
    const maxV = this.dashTimer > 0 ? this.speed * 2.4 : this.speed;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > maxV) { this.vx = this.vx / sp * maxV; this.vy = this.vy / sp * maxV; }

    // stronger dash readability via trailing particles
    if (this.dashTimer > 0 && this.dashTrailT <= 0) {
      const ta = Math.atan2(this.vy || Math.sin(this.angle), this.vx || Math.cos(this.angle));
      const px = this.x - Math.cos(ta) * this.r * 0.8;
      const py = this.y - Math.sin(ta) * this.r * 0.8;
      game.particles.spawn(
        px,
        py,
        -Math.cos(ta) * (60 + Math.random() * 80),
        -Math.sin(ta) * (60 + Math.random() * 80),
        0.22 + Math.random() * 0.22,
        1.3 + Math.random() * 1.2,
        195,
        85,
        76,
        0.6
      );
      this.dashTrailT = 0.02;
    }

    // turn smoothly toward velocity
    if (sp > 5) {
      const target = Math.atan2(this.vy, this.vx);
      const d = angDelta(this.angle, target);
      const tr = T.PLAYER_TURN_RATE * this.stats.turnMul;
      this.angle += clamp(d, -tr * dt, tr * dt);
    }
    // spine-bend physics
    if (this._spinePrevAngle === undefined) this._spinePrevAngle = this.angle;
    let _spDelta = this.angle - this._spinePrevAngle;
    if (_spDelta > Math.PI) _spDelta -= TAU;
    if (_spDelta < -Math.PI) _spDelta += TAU;
    this._spinePrevAngle = this.angle;
    const _pBendTarget = clamp(_spDelta / Math.max(0.008, dt) * 0.055, -0.85, 0.85);
    this._bendMid  = lerp(this._bendMid  || 0, _pBendTarget, Math.min(1, dt * 5.5));
    this._bendTail = lerp(this._bendTail || 0, this._bendMid, Math.min(1, dt * 3.2));

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const rd = Math.hypot(this.x, this.y);
    if (rd > this.deepestRadius) this.deepestRadius = rd;

    // energy/metabolism
    const sizeBurden = 1 + Math.max(0, (this.r - T.PLAYER_START_SIZE)) * 0.045;
    const movFactor = 0.4 + 0.7 * (Math.hypot(this.vx, this.vy) / Math.max(40, this.speed));
    const drain = T.METABOLISM_BASE * this.stats.metabMul * sizeBurden * movFactor;
    this.energy -= drain * dt;

    // passive filter feeding
    if (this.filter > 0) {
      const near = game.queryFoodNear(this.x, this.y, 80);
      if (near.length > 0) this.energy = Math.min(this.stats.energyMax, this.energy + this.filter * dt * Math.min(near.length, 4) * 0.3);
    }

    if (this.energy <= 0) {
      this.energy = 0;
      // starvation damage
      this.takeDamage(8 * dt, 'Starved');
    }

    // out-of-combat regen
    if (this.timeSinceDamage > T.REGEN_DELAY && this.energy > 10 && this.hp < this.stats.hpMax) {
      const h = T.HEAL_RATE * this.stats.healMul * dt;
      this.hp = Math.min(this.stats.hpMax, this.hp + h);
      this.energy -= h * 0.5;
    }

    const mutationSize = T.PLAYER_START_SIZE * this.stats.sizeMul;
    const feedingSize = (1 + this.kills * 0.014 + this.eaten * 0.004);
    const fed = clamp(this.energy / Math.max(1, this.stats.energyMax), 0, 1);
    const starvationMul = this.starveSizeFloorMul + (1 - this.starveSizeFloorMul) * fed;
    this.r = mutationSize * feedingSize * starvationMul;
    this.r = Math.min(this.r, T.PLAYER_MAX_SIZE);
    const minSurvivalSize = mutationSize * this.starveSizeFloorMul;
    if (this.energy <= 0 && this.r <= minSurvivalSize + 0.05) {
      this.takeDamage(10 * dt, 'Starved');
    }
    if (this.r > this.maxSizeReached) this.maxSizeReached = this.r;
  }

  sayPolite() {
    if (this.politeBubbleCD > 0) return;
    const opts = ['excuse me', 'pardon me', 'oops'];
    this.politeBubbleText = opts[(Math.random() * opts.length) | 0];
    this.politeBubbleT = 0.9;
    this.politeBubbleCD = 1.2;
  }

  draw(ctx, camX, camY, w, h) {
    const sx = this.x - camX + w * 0.5;
    const sy = this.y - camY + h * 0.5;
    const r = this.r;

    // hatching: render the egg instead of player body
    if (this.hatching && this.egg) {
      this.egg.draw(ctx, camX, camY, w, h);
      return;
    }

    // mating progress ring
    if (this.mateTarget && this.mateT > 0) {
      const prog = this.mateT / T.MATE_TIME;
      ctx.strokeStyle = hslaCSS(300, 80, 75, 0.7 * prog);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(sx, sy, r * 2.2, -Math.PI / 2, -Math.PI / 2 + prog * TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // dash trail
    if (this.dashTimer > 0) {
      ctx.fillStyle = hslaCSS(190, 80, 70, 0.18);
      ctx.beginPath(); ctx.arc(sx, sy, r * 2.0, 0, TAU); ctx.fill();
    }

    // damage glow
    if (this.damageGlow > 0) {
      ctx.fillStyle = hslaCSS(0, 80, 60, 0.35 * this.damageGlow);
      ctx.beginPath(); ctx.arc(sx, sy, r * 1.7, 0, TAU); ctx.fill();
    }

    // eating pulse ring
    if (this.eatTimer > 0) {
      const eatProg = 1 - this.eatTimer / this.eatDuration;
      ctx.strokeStyle = hslaCSS(this.diet === 'carnivore' ? 0 : this.diet === 'herbivore' ? 100 : 190, 80, 65, 0.55 * (1 - eatProg));
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx, sy, r * (1.3 + eatProg * 0.8), 0, TAU); ctx.stroke();

      if (this.eatTarget && !this.eatTarget.dead) {
        const tx = this.eatTarget.x - camX + w * 0.5;
        const ty = this.eatTarget.y - camY + h * 0.5;
        ctx.strokeStyle = hslaCSS(this.diet === 'carnivore' ? 350 : 115, 85, 70, 0.55 * (1 - eatProg));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
    }

    // body glow
    const glowR = r * (this.lure > 0 ? 3.5 : 2.2);
    const grad = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, glowR);
    grad.addColorStop(0, hslaCSS(190, 90, 75, 0.65));
    grad.addColorStop(1, hslaCSS(190, 90, 60, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, glowR, 0, TAU); ctx.fill();

  // body - fish-body bezier silhouette with spine-bend
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);

    const gLevel = Math.round(
      clamp((this.r - T.PLAYER_START_SIZE) / Math.max(1, T.PLAYER_MAX_SIZE - T.PLAYER_START_SIZE), 0, 1) * 9
    );
    const spineExt = 1 + Math.min(gLevel, 9) * 0.022;   // spine visibly extends with growth level
    const bodyShape = this.creatorBody || 'round';
    const bHue = this.creatorHue !== undefined ? this.creatorHue : 195;
    const motion = clamp(Math.hypot(this.vx || 0, this.vy || 0) / Math.max(1, this.speed), 0, 1);
    const prx = r * (bodyShape==='long'?1.38:bodyShape==='oval'?1.14:bodyShape==='soft'?0.96:1.04) * spineExt * (1 + motion * 0.07);
    const pry = r * (bodyShape==='long'?0.60:bodyShape==='oval'?0.80:bodyShape==='soft'?0.94:0.80) * (1 + Math.min(gLevel, 9) * 0.006) * (1 - motion * 0.04);
    const ptailX  = -(prx + r * 0.16);
    const pheadX  =  prx * 0.80;
    const pheadTip = prx + r * 0.40;
    const tailShiftP = (this._bendTail || 0) * prx * 0.42;
    const midShiftP  = (this._bendMid  || 0) * prx * 0.18;
    const ptailW = pry * 0.46;

    ctx.fillStyle   = hslaCSS(bHue, 75, 75, 0.95);
    ctx.strokeStyle = hslaCSS(bHue, 80, 85, 0.6);
    ctx.lineWidth = Math.max(0.8, r * 0.038);
    ctx.beginPath();
    ctx.moveTo(ptailX, ptailW + tailShiftP);
    ctx.bezierCurveTo(ptailX * 0.62 + midShiftP * 0.5, pry * 0.72 + tailShiftP * 0.5,
                      -prx * 0.10 + midShiftP,          pry,
                       pheadX,                           pry * 0.30);
    ctx.bezierCurveTo(pheadX * 0.55, pry * 0.60, pheadTip, pry * 0.30, pheadTip, 0);
    ctx.bezierCurveTo(pheadTip, -pry * 0.30, pheadX * 0.55, -pry * 0.60, pheadX, -pry * 0.30);
    ctx.bezierCurveTo(-prx * 0.10 - midShiftP, -pry,
                       ptailX * 0.62 - midShiftP * 0.5, -pry * 0.72 - tailShiftP * 0.5,
                       ptailX, -(ptailW + tailShiftP));
    ctx.lineTo(ptailX, ptailW + tailShiftP);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = hslaCSS(bHue, 70, 50, 0.55);
    ctx.beginPath(); ctx.arc(prx * 0.05, 0, r * 0.32, 0, TAU); ctx.fill();

    const eyeX = pheadX * 0.72, eyeY = -pry * 0.38;
    ctx.fillStyle = hslaCSS(0, 0, 96, 0.92);
    ctx.beginPath(); ctx.arc(eyeX, eyeY, r * 0.155, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(bHue + 20, 65, 45, 0.90);
    ctx.beginPath(); ctx.arc(eyeX + r*0.025, eyeY, r * 0.10, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(0, 0, 8, 1);
    ctx.beginPath(); ctx.arc(eyeX + r*0.035, eyeY, r * 0.058, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(0, 0, 100, 0.85);
    ctx.beginPath(); ctx.arc(eyeX + r*0.055, eyeY - r*0.038, r * 0.028, 0, TAU); ctx.fill();

    ctx.strokeStyle = hslaCSS(bHue + 10, 50, 35, 0.55);
    ctx.lineWidth = Math.max(0.6, r * 0.028);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pheadTip - r*0.04, -r*0.055);
    ctx.lineTo(pheadTip + r*0.02,  r*0.055);
    ctx.stroke();
    ctx.lineCap = 'butt';

    this.drawMutationParts(ctx, r);

    ctx.restore();
    if (this.politeBubbleT > 0 && this.politeBubbleText) {
      const alpha = clamp(this.politeBubbleT / 0.9, 0, 1);
      const tx = sx;
      const ty = sy - r - 24;
      const bw = Math.max(44, this.politeBubbleText.length * 7.1);
      const bh = 16;
      ctx.fillStyle = hslaCSS(200, 25, 12, 0.72 * alpha);
      ctx.strokeStyle = hslaCSS(195, 50, 78, 0.7 * alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx - bw * 0.5, ty - bh * 0.5, bw, bh, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hslaCSS(190, 85, 92, 0.9 * alpha);
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.politeBubbleText, tx, ty + 3.5);
    }
  }

  drawMutationParts(ctx, r) {
    const has = (id) => this.mutations.includes(id);
    const bShape = this.creatorBody || 'round';
    const bHue   = this.creatorHue !== undefined ? this.creatorHue : 195;
    const gs     = 1 + (this.r - T.PLAYER_START_SIZE) * 0.018;
    const motion = clamp(Math.hypot(this.vx || 0, this.vy || 0) / Math.max(1, this.speed), 0, 1);
    const prx    = r * (bShape==='long'?1.38:bShape==='oval'?1.14:bShape==='soft'?0.96:1.04) * gs * (1 + motion * 0.07);
    const pry    = r * (bShape==='long'?0.60:bShape==='oval'?0.80:bShape==='soft'?0.94:0.80) * gs * (1 - motion * 0.04);
    const ptailX  = -(prx + r * 0.16);
    const pheadX  =  prx * 0.80;
    const pheadTip = prx + r * 0.40;

    if (has('spikes')) {
      ctx.fillStyle   = hslaCSS(bHue - 15, 55, 58, 0.85);
      ctx.strokeStyle = hslaCSS(bHue - 10, 50, 72, 0.45);
      ctx.lineWidth = Math.max(0.5, r * 0.025) * gs;
      for (let i = 0; i < 5; i++) {
        const bx = lerp(ptailX * 0.40, pheadX * 0.55, i / 4);
        const h  = r * (0.55 - Math.abs(i - 2) * 0.07) * gs;
        ctx.beginPath();
        ctx.moveTo(bx - r*0.07*gs, -pry * 0.92);
        ctx.lineTo(bx,              -(pry * 0.92 + h));
        ctx.lineTo(bx + r*0.07*gs, -pry * 0.92);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
    if (has('armor') || has('plates')) {
      ctx.strokeStyle = hslaCSS(bHue + 10, 30, 72, 0.55);
      ctx.lineWidth = Math.max(0.8, r * 0.045) * gs;
      for (const sy2 of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(0, sy2 * pry * 0.72, prx * 0.52, pry * 0.22, 0, 0, TAU);
        ctx.stroke();
      }
    }
    if (has('eyes')) {
      const offsets = [[-0.38, -0.42], [-0.62, -0.06], [-0.38, 0.42]];
      for (const [px2, py2] of offsets) {
        const ex2 = px2 * r * gs, ey2 = py2 * pry;
        ctx.fillStyle = hslaCSS(0, 0, 96, 0.90);
        ctx.beginPath(); ctx.arc(ex2, ey2, r * 0.115 * gs, 0, TAU); ctx.fill();
        ctx.strokeStyle = hslaCSS(bHue + 20, 60, 45, 0.75);
        ctx.lineWidth = r * 0.040 * gs;
        ctx.beginPath(); ctx.arc(ex2 + r*0.018*gs, ey2, r * 0.070 * gs, 0, TAU); ctx.stroke();
        ctx.fillStyle = hslaCSS(0, 0, 8, 1);
        ctx.beginPath(); ctx.arc(ex2 + r*0.025*gs, ey2, r * 0.040 * gs, 0, TAU); ctx.fill();
      }
    }
    if (has('glow')) {
      const grad = ctx.createRadialGradient(0, 0, r * 0.35 * gs, 0, 0, r * 3 * gs);
      grad.addColorStop(0, hslaCSS(55, 88, 75, 0.22));
      grad.addColorStop(1, hslaCSS(55, 88, 60, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, r * 3 * gs, 0, TAU); ctx.fill();
    }
    if (has('jet')) {
      const jg = ctx.createLinearGradient(ptailX * 1.05, 0, ptailX * 1.65, 0);
      jg.addColorStop(0, hslaCSS(190, 85, 72, 0.72));
      jg.addColorStop(1, hslaCSS(190, 85, 72, 0));
      ctx.fillStyle = jg;
      ctx.beginPath();
      ctx.moveTo(ptailX, -pry * 0.30);
      ctx.lineTo(ptailX * 1.60, 0);
      ctx.lineTo(ptailX,  pry * 0.30);
      ctx.closePath();
      ctx.fill();
    }
    if (has('venom')) {
      ctx.fillStyle = hslaCSS(110, 72, 55, 0.78);
      ctx.strokeStyle = hslaCSS(110, 60, 38, 0.55);
      ctx.lineWidth = Math.max(0.5, r * 0.022) * gs;
      ctx.beginPath();
      ctx.moveTo(pheadTip, 0);
      ctx.lineTo(pheadTip + r*0.28*gs, -r*0.11*gs);
      ctx.lineTo(pheadTip + r*0.22*gs,  r*0.11*gs);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (has('filter')) {
      ctx.strokeStyle = hslaCSS(bHue + 15, 60, 80, 0.55);
      ctx.lineWidth = Math.max(0.5, r * 0.030) * gs;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const a = side * (-Math.PI * 0.42 + i * (Math.PI * 0.84 / 6));
          ctx.beginPath();
          ctx.moveTo(pheadX * 0.85, side * r * 0.10 * gs);
          ctx.quadraticCurveTo(pheadX * 0.95 + r*0.22*gs*Math.cos(a), side*r*0.28*gs*Math.sin(Math.abs(a)),
                                pheadX * 0.90 + r*0.55*gs*Math.cos(a), side*r*0.55*gs*Math.sin(Math.abs(a)));
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
    }
    if (has('mandibles')) {
      ctx.fillStyle   = hslaCSS(bHue - 20, 38, 72, 0.82);
      ctx.strokeStyle = hslaCSS(bHue - 15, 32, 58, 0.45);
      ctx.lineWidth = Math.max(0.5, r * 0.028) * gs;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(pheadX * 0.92, side * r * 0.22 * gs);
        ctx.bezierCurveTo(pheadX * 1.15, side * r * 0.40 * gs,
                          pheadTip * 0.95, side * r * 0.52 * gs,
                          pheadTip * 0.90, side * r * 0.18 * gs);
        ctx.bezierCurveTo(pheadTip * 0.95, side * r * 0.04 * gs,
                          pheadX * 1.08,   side * r * 0.04 * gs,
                          pheadX * 0.92,   side * r * 0.22 * gs);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
    if (has('fins')) {
      ctx.fillStyle   = hslaCSS(bHue, 62, 74, 0.52);
      ctx.strokeStyle = hslaCSS(bHue, 58, 62, 0.40);
      ctx.lineWidth = Math.max(0.5, r * 0.022) * gs;
      for (const side of [-1, 1]) {
        const bx2 = -prx * 0.08, by2 = side * pry * 0.88;
        const tx2 = -prx * 0.48, ty2 = side * pry * 1.65;
        const ex2 = prx * 0.30,  ey2 = side * pry * 0.90;
        ctx.beginPath();
        ctx.moveTo(bx2, by2);
        ctx.bezierCurveTo(bx2 - r*0.10*gs, side*pry*1.15, tx2 - r*0.06*gs, side*pry*1.48, tx2, ty2);
        ctx.bezierCurveTo(tx2 + r*0.16*gs, side*pry*1.32, ex2 - r*0.04*gs, side*pry*1.02, ex2, ey2);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = hslaCSS(bHue, 58, 58, 0.28);
        ctx.lineWidth = Math.max(0.4, r * 0.015) * gs;
        for (let v = 1; v <= 3; v++) {
          const vt = v / 4;
          ctx.beginPath();
          ctx.moveTo(lerp(bx2, tx2, vt*0.55), lerp(by2, ty2, vt*0.55));
          ctx.lineTo(lerp(bx2, ex2, vt*0.72), lerp(by2, ey2, vt*0.72));
          ctx.stroke();
        }
        ctx.strokeStyle = hslaCSS(bHue, 58, 62, 0.40);
        ctx.lineWidth = Math.max(0.5, r * 0.022) * gs;
      }
    }
    if (has('camo')) {
      ctx.fillStyle = hslaCSS(bHue, 28, 50, 0.16);
      ctx.beginPath(); ctx.arc(0, 0, prx * 1.05, 0, TAU); ctx.fill();
    }
    if (has('predator_sense')) {
      ctx.strokeStyle = hslaCSS(280, 78, 72, 0.22);
      ctx.lineWidth = Math.max(0.6, r * 0.028) * gs;
      ctx.beginPath(); ctx.arc(0, 0, r * 2.4 * gs, 0, TAU); ctx.stroke();
    }

    if (this.evolvedParts && this.evolvedParts.length > 0) {
      if (this.evolvedParts.includes('frill')) {
        ctx.strokeStyle = hslaCSS((bHue) + 25, 62, 78, 0.50);
        ctx.lineWidth = Math.max(0.6, r * 0.028) * gs;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI * 0.68 + i * 0.20;
          const ir = r * 0.92 * gs, or2 = r * 1.32 * gs;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * ir, Math.sin(a) * ir);
          ctx.lineTo(Math.cos(a) * or2, Math.sin(a) * or2);
          ctx.stroke();
        }
      }
      if (this.evolvedParts.includes('tendril')) {
        ctx.strokeStyle = hslaCSS(bHue, 45, 72, 0.50);
        ctx.lineWidth = Math.max(0.5, r * 0.025) * gs;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const w1 = Math.sin(performance.now() * 0.006 + this.totalTime * 0.8) * r * 0.30 * gs;
          const w2 = Math.sin(performance.now() * 0.0045 + this.totalTime * 0.5 + 1.8) * r * 0.24 * gs;
          ctx.beginPath();
          ctx.moveTo(ptailX * 0.88, side * r * 0.18 * gs);
          ctx.bezierCurveTo(ptailX * 1.22, side * r * 0.32 * gs + w1 * 0.25,
                            ptailX * 1.55, side * r * 0.42 * gs - w1 * 0.20,
                            ptailX * 1.90, side * r * 0.30 * gs + w2);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATURE BODY — cosmetic procedural-body module (P0: stub)
//
// CreatureBody is a *purely cosmetic* layer.  It reads authoritative position /
// velocity / angle from the Creature it is attached to but never writes back to
// those fields.  Gameplay (collision, AI, saves, seed replay) is unaffected.
//
// Each phase (P1–P5) extends this class with real simulation.  While
// T.PROC_BODY is false the module is instantiated but its draw() is never
// called, so zero extra cost is incurred at runtime.
// ─────────────────────────────────────────────────────────────────────────────
class CreatureBody {
  /**
   * @param {Creature} creature  Owning creature (read-only reference).
   * @param {number}   bodySeed  Deterministic seed for reproducible body shape.
   */
  constructor(creature, bodySeed) {
    this.creature = creature;
    this.bodySeed = bodySeed;
    // Populated by P1 (spine nodes) or P2 (membrane nodes).
    this.nodes = [];
  }

  /**
   * Advance the cosmetic simulation by dt seconds.
   * Called every frame regardless of T.PROC_BODY so the sim stays warm if the
   * flag is toggled at runtime.  P0: no-op.
   * @param {number} dt
   */
  update(dt) {
    // P1+ fills this in.
  }

  /**
   * Draw the procedural body on top of / instead of the legacy shape.
   * Only called when T.PROC_BODY is true.  P0: no-op (legacy draw runs).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX
   * @param {number} camY
   * @param {number} w   Canvas width
   * @param {number} h   Canvas height
   */
  draw(ctx, camX, camY, w, h) {
    // P1+ fills this in.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATURE
// ─────────────────────────────────────────────────────────────────────────────
class Creature extends Entity {
  constructor(x, y, template, opts = {}) {
    super(x, y);
    this.kind = 'creature';
    this.templateId = template.id;
    this.name = opts.name || template.name;
    this.archetype = template.behavior;
    this.behavior = template.behavior;

    const rng = opts.rng || Math.random;
    const sz = opts.sizeOverride || (template.sizeRange[0] + rng() * (template.sizeRange[1] - template.sizeRange[0]));
    this.r = sz * (opts.sizeBoost || 1);
    this.baseR = this.r;
    this.maxHP = (40 + sz * 5) * template.hpMul * (opts.hpBoost || 1);
    this.hp = this.maxHP;
    this.biteDmg = template.biteDmg * (opts.dmgBoost || 1);
    this.maxSpeed = template.speed * (0.85 + rng() * 0.3);
    this.accel = template.accel * (0.85 + rng() * 0.3);
    this.aggression = template.aggression;
    this.fearMul = template.fearMul;
    this.hunger = rng() * 0.4 + 0.3;
    this.maxHunger = 1;
    this.food = template.food;
    this.diet = template.diet || 'omnivore';
    this.xpValue = template.xp;
    this.scared = 0;
    this.angry = 0;
    this.target = null;
    this.targetT = 0;
    this.state = 'wander';
    this.stateT = 0;
    this.wanderAngle = rng() * TAU;
    this.swarmId = opts.swarmId || 0;
    this.parts = (opts.parts || template.parts).slice();
    // Increase prevalence of defining visible traits.
    if (!this.parts.includes('fin') && rng() < 0.42) this.parts.push('fin');
    if (!this.parts.includes('eyespot') && rng() < 0.5) this.parts.push('eyespot');
    if (!this.parts.includes('spike') && template.diet === 'carnivore' && rng() < 0.33) this.parts.push('spike');
    if (!this.parts.includes('plate') && template.behavior === 'territorial' && rng() < 0.28) this.parts.push('plate');
    this.hue = opts.hue !== undefined ? opts.hue : (220 + (template.huesShift || 0) + (rng() - 0.5) * 60);
    this.sat = 50 + rng() * 30;
    this.light = 55 + rng() * 15;
    this.body = template.body;
    this.thinkT = rng() * 0.5;
    this.fleeing = false;
    this.legendary = !!opts.legendary;
    this.unique = opts.unique;
    this.attackCD = 0;
    this.venomT = 0;
    this.venomDPS = 0;
    this.territoryX = x;
    this.territoryY = y;
    this.deathT = 0;
    this.canSeePlayer = false;
    this.bornAt = 0;
    this.distantUpdate = false;
    this.meatDropped = false;
    this.hitFlash = 0;
    this.eatenMark = 0;
    this.growthPulse = 0;
    this.speciesTag = `${this.body}:${template.diet}`;
    this.evadeBias = rng() < 0.5 ? -1 : 1;
    this.growthLevel = 0;
    this.bonusComplexity = 0;
    this.forageAnchorX = x;
    this.forageAnchorY = y;
    this.forageAnchorT = 0;
    this.propulsion = TEMPLATE_PROPULSION[template.id] || 'glide';
    this._propulsionT = rng() * (PROPULSION_PROFILES[this.propulsion].cycle || 1.0);
    // NPC mating cooldown (seconds). 0 = ready.
    this.mateCD = 0;

    // bodySeed: deterministic from the creature's own rng stream so bodies
    // reproduce identically from the same game seed.  Old saves that lack this
    // field will reconstruct a stable default via opts.bodySeed fallback.
    this.bodySeed = opts.bodySeed !== undefined ? opts.bodySeed : rng();

    this._ensureCoreAnatomy(rng);
    this._refreshGrowthLevel(rng, true);

    // Cosmetic procedural-body module.  Instantiated here so the object is
    // always present; drawing is gated by T.PROC_BODY inside Creature.draw().
    this.procBody = new CreatureBody(this, this.bodySeed);
  }

  detection() {
    let base = 200 + this.r * 5;
    if (this.behavior === 'ambush') base *= 0.6;
    if (this.parts.includes('eyespot')) base *= 1.2;
    return base;
  }

  _hasAnyPart(partList) {
    for (const p of partList) if (this.parts.includes(p)) return true;
    return false;
  }

  _ensureCoreAnatomy(rng) {
    const propulsionParts = ['cilia', 'tail', 'fin'];
    if (!this._hasAnyPart(propulsionParts)) {
      if (this.body === 'long') this.parts.push('tail');
      else if (this.body === 'soft') this.parts.push('cilia');
      else this.parts.push(rng() < 0.55 ? 'tail' : 'fin');
    }

    const carnivoreMouth = ['mandible', 'spike'];
    const herbivoreMouth = ['filtermouth'];
    const omniMouth = ['mandible', 'filtermouth'];
    const mouthSet = this.diet === 'carnivore' ? carnivoreMouth : this.diet === 'herbivore' ? herbivoreMouth : omniMouth;
    if (!this._hasAnyPart(mouthSet)) {
      if (this.diet === 'carnivore') this.parts.push('mandible');
      else if (this.diet === 'herbivore') this.parts.push('filtermouth');
      else this.parts.push(rng() < 0.5 ? 'mandible' : 'filtermouth');
    }
  }

  _refreshGrowthLevel(rng, force = false) {
    const level = clamp(Math.floor((this.r / Math.max(1, this.baseR) - 1) / 0.22), 0, 12);
    if (!force && level <= this.growthLevel) return;
    while (this.growthLevel < level) {
      this.growthLevel++;
      this._addComplexityPoint(rng);
    }
  }

  _addComplexityPoint(rng) {
    const dietPool = this.diet === 'carnivore'
      ? ['spike', 'mandible', 'fin', 'eyespot', 'tail', 'plate']
      : this.diet === 'herbivore'
        ? ['filtermouth', 'plate', 'fin', 'eyespot', 'cilia']
        : ['mandible', 'filtermouth', 'fin', 'eyespot', 'tail', 'plate'];
    const missing = dietPool.filter((part) => !this.parts.includes(part));
    if (missing.length > 0) {
      this.parts.push(rngPick(rng, missing));
      return;
    }
    // If all available parts already exist, convert complexity to slight body growth.
    this.r = Math.min(this.baseR * 1.95, this.r * 1.01 + 0.12);
  }

  takeDamage(amount, source, game, hitFrom = null) {
    this.hp -= amount;
    this.scared += 0.6;
    this.hitFlash = Math.min(1.6, this.hitFlash + 0.92);

    let hx = 0;
    let hy = 0;
    if (hitFrom && Number.isFinite(hitFrom.x) && Number.isFinite(hitFrom.y)) {
      hx = this.x - hitFrom.x;
      hy = this.y - hitFrom.y;
    } else if (source === 'player' && game && game.player) {
      hx = this.x - game.player.x;
      hy = this.y - game.player.y;
    }
    const hm = Math.hypot(hx, hy) || 1;
    if (Math.abs(hx) + Math.abs(hy) > 0.001) {
      const recoil = clamp(12 + amount * 0.55, 10, 56);
      this.vx += (hx / hm) * recoil;
      this.vy += (hy / hm) * recoil;
    }

    if (game) {
      game.particles.burst(this.x, this.y, 10, { speed: 108, life: 0.42, r: 1.85, h: 355, s: 84, l: 60 });
    }
    if (source === 'player') this.angry += 0.4;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deathT = 0;
      if (game) {
        game.particles.burst(this.x, this.y, 18, { speed: 140, life: 0.75, r: 2.3, h: 350, s: 80, l: 56 });
      }
      if (game && source !== 'player') game.dropMeatFromCreature(this, 0.75);
      if (game && source !== 'player') game.dropPartShardsFromCreature(this, 0.85);
      if (source === 'player' && game) {
        game.onPlayerKill(this);
      }
    }
  }

  growBy(amount, game) {
    if (this.dead || amount <= 0) return;
    const cap = this.baseR * 1.85;
    const inc = amount * 0.02;
    this.r = Math.min(cap, this.r + inc);
    this.maxHP += inc * 0.9;
    this.hp = Math.min(this.maxHP, this.hp + inc * 0.6);
    this.growthPulse = Math.min(1.4, this.growthPulse + 0.5);
    this._refreshGrowthLevel(Math.random);
    if (game) game.particles.burst(this.x, this.y, 4, { speed: 40, life: 0.4, r: 1.2, h: 150, s: 70, l: 62 });
  }

  applyVenom(dps, dur) {
    this.venomDPS = Math.max(this.venomDPS, dps);
    this.venomT = Math.max(this.venomT, dur);
  }

  update(dt, game) {
    if (this.dead) {
      this.deathT += dt;
      this.vx *= (1 - 1.6 * dt); this.vy *= (1 - 1.6 * dt);
      return;
    }
    if (this.venomT > 0) {
      this.venomT -= dt;
      this.hp -= this.venomDPS * dt;
      if (this.hp <= 0) { this.hp = 0; this.dead = true; this.deathT = 0; game.onPlayerKill(this); }
    }
    if (this.distantUpdate) {
      this.x += this.vx * dt * 0.5; this.y += this.vy * dt * 0.5;
      this.vx *= (1 - 1.0 * dt); this.vy *= (1 - 1.0 * dt);
      this.wanderAngle += (Math.random() - 0.5) * 0.6 * dt;
      this.vx += Math.cos(this.wanderAngle) * 20 * dt;
      this.vy += Math.sin(this.wanderAngle) * 20 * dt;
      this.scared = Math.max(0, this.scared - dt * 0.5);
      this.angry = Math.max(0, this.angry - dt * 0.3);
      return;
    }

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.think(game);
      this.thinkT = 0.18 + Math.random() * 0.15;
    }
    this.act(dt, game);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Heading is fully driven in act(); no post-update angle nudging needed.
    // (Collision knockback adjusts velocity; the next act() reconciles heading.)
    // spine-bend physics
    if (this._spinePrevAngle === undefined) this._spinePrevAngle = this.angle;
    let _cSpDelta = this.angle - this._spinePrevAngle;
    if (_cSpDelta > Math.PI) _cSpDelta -= TAU;
    if (_cSpDelta < -Math.PI) _cSpDelta += TAU;
    this._spinePrevAngle = this.angle;
    const _cBendTarget = clamp(_cSpDelta / Math.max(0.008, dt) * 0.055, -0.85, 0.85);
    this._bendMid  = lerp(this._bendMid  || 0, _cBendTarget, Math.min(1, dt * 4.5));
    this._bendTail = lerp(this._bendTail || 0, this._bendMid, Math.min(1, dt * 2.8));

    this.scared = Math.max(0, this.scared - dt * 0.4);
    this.angry = Math.max(0, this.angry - dt * 0.2);
    this.attackCD = Math.max(0, this.attackCD - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.6);
    this.eatenMark = Math.max(0, this.eatenMark - dt * 1.35);
    this.growthPulse = Math.max(0, this.growthPulse - dt * 1.05);
    this.hunger = Math.min(this.maxHunger, this.hunger + dt * 0.02);
    this.stateT += dt;

    // Advance cosmetic body simulation (no-op until P1+ is implemented).
    this.procBody.update(dt);

  }

  think(game) {
    const p = game.player;
    const pdx = p.x - this.x, pdy = p.y - this.y;
    const pd = Math.hypot(pdx, pdy);
    const det = this.detection() * p.stats.stealthMul;
    const playerVisible = !p.hatching && (pd < det || (p.lure > 0 && pd < det + p.lure));
    this.canSeePlayer = playerVisible;

    const playerThreat = (p.r > this.r * 1.05) || (p.intimidate > 1.5 && p.r > this.r * 0.8);
    const playerPrey = this.r > p.r * 1.2 && this.aggression > 0.1;
    const hungerBias = this.diet === 'herbivore' ? -0.12 : 0;
    const isStarving = this.hunger > (0.7 + hungerBias);
    const isHungry = this.hunger > (0.42 + hungerBias);

    // Find a weaker nearby creature as alternate prey
    let altPrey = null, altPreyDist = Infinity;
    if (this.aggression > 0.2) {
      const nearby = game.grid.query(this.x, this.y, det * 0.7, game._scratch);
      for (const e of nearby) {
        if (e.kind !== 'creature' || e === this || e.dead) continue;
        if (e.r < this.r * 0.9) {
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d < altPreyDist) { altPreyDist = d; altPrey = e; }
        }
      }
    }

    // Chase break-off: if chasing player but a closer/easier creature exists, switch
    const chasingPlayer = (this.state === 'hunt' || this.state === 'attack') && this.target === p;
    if (chasingPlayer && altPrey && altPreyDist < pd * 0.65) {
      this.target = altPrey;
    }

    // Flocking: bias wander toward same-species centroid
    this.flockX = 0; this.flockY = 0; this.flockCount = 0;
    if (this.behavior === 'wander' || this.behavior === 'graze' || this.behavior === 'swarm') {
      const nearby = game.grid.query(this.x, this.y, 300, game._scratch);
      for (const e of nearby) {
        if (e.kind !== 'creature' || e === this || e.dead) continue;
        if (e.templateId === this.templateId) {
          this.flockX += e.x; this.flockY += e.y; this.flockCount++;
        }
      }
    }

    let next = this.state;

    if (this.scared > 0.6 || (playerVisible && playerThreat && this.aggression < 0.9)) {
      next = 'flee';
    } else if (this.angry > 0.6 && playerVisible) {
      next = 'attack';
    } else {
      switch (this.behavior) {
        case 'wander':
          if (altPrey && altPreyDist < 200 && this.aggression > 0.3) next = 'huntCreature';
          else if (isHungry) next = 'seekFood';
          else next = 'wander';
          break;
        case 'graze':
          if (playerVisible && playerThreat) next = 'flee';
          else next = (isStarving || isHungry) ? (Math.random() < 0.7 ? 'seekFood' : 'wander') : (Math.random() < 0.35 ? 'graze' : 'wander');
          break;
        case 'swarm':
          if (altPrey && altPreyDist < 180) next = 'huntCreature';
          else if (playerVisible && playerPrey) next = 'attack';
          else if (playerVisible && playerThreat) next = 'flee';
          else next = Math.random() < 0.2 ? 'seekFood' : 'wander';
          break;
        case 'darter':
          if (altPrey && altPreyDist < pd * 0.8) next = 'huntCreature';
          else if (playerVisible && playerPrey) next = 'hunt';
          else if (playerVisible && playerThreat) next = 'flee';
          else next = 'wander';
          break;
        case 'hunt':
          if (altPrey && altPreyDist < pd * 0.7) next = 'huntCreature';
          else if (playerVisible && (playerPrey || this.aggression > 0.8)) next = 'hunt';
          else if (playerVisible && playerThreat && this.aggression < 0.95) next = 'flee';
          else next = isStarving ? 'seekFood' : (Math.random() < 0.78 ? 'wander' : 'seekFood');
          break;
        case 'ambush':
          if (altPrey && altPreyDist < this.r * 5) next = 'huntCreature';
          else if (playerVisible && pd < this.r * 6 && (playerPrey || this.aggression > 0.7)) next = 'attack';
          else next = 'hide';
          break;
        case 'territorial': {
          const dt2 = Math.hypot(this.x - this.territoryX, this.y - this.territoryY);
          if (altPrey && altPreyDist < 260 && dt2 < 350) next = 'huntCreature';
          else if (playerVisible && dt2 < 350 && (this.aggression > 0.5 || playerPrey || p.provokes)) next = 'attack';
          else if (dt2 > 280) next = 'patrol';
          else next = 'wander';
          break;
        }
        case 'scavenge':
          if (playerVisible && playerThreat) next = 'flee';
          else next = 'scavenge';
          break;
        case 'parasite':
          if (playerVisible && !p.hatching && (p.r > this.r * 2)) next = 'hunt';
          else if (altPrey && altPreyDist < 250) next = 'huntCreature';
          else next = 'wander';
          break;
      }
    }

    // Baseline behavior request: if not actively fleeing/fighting, creatures
    // should always be pursuing food or a mate.
    const combatOrFear = (next === 'flee' || next === 'attack' || next === 'hunt' || next === 'huntCreature');
    if (!combatOrFear && next !== 'scavenge' && next !== 'escort') {
      const mate = game.findMateTargetForCreature(this, 620);
      if (mate) {
        next = 'seekMate';
      } else {
        next = 'seekFood';
      }
    }

    if (next !== this.state) {
      this.state = next;
      this.stateT = 0;
    }

    // target acquisition
    if (next === 'hunt' || next === 'attack') this.target = p;
    if (next === 'huntCreature') {
      if (!altPrey || altPrey.dead) {
        this.state = 'wander'; this.target = null;
      } else {
        this.target = altPrey;
      }
    }
    if (next === 'flee') this.target = p;
    if (next === 'seekMate') {
      this.targetT -= 0.35;
      if (!this.target || this.target.dead || this.targetT < 0 || this.target.mateCD > 0) {
        this.target = game.findMateTargetForCreature(this, 700);
        this.targetT = 0.8 + Math.random() * 0.8;
      }
    }
    if (next === 'seekFood' || next === 'scavenge') {
      this.targetT -= 0.4;
      if (!this.target || this.target.dead || this.targetT < 0) {
        if (next === 'scavenge') this.target = game.findCorpse(this.x, this.y, 600);
        else this.target = game.findFoodTargetForCreature(this, 620, true);
        this.targetT = 1.0 + Math.random();
      }
    }
  }

  act(dt, game) {
    const p = game.player;
    let goalX = this.x, goalY = this.y;
    let drive = 1.0;

    switch (this.state) {
      case 'wander': {
        this.wanderAngle += (Math.random() - 0.5) * 0.5 * dt;
        // flock pull
        if (this.flockCount > 0) {
          const cx = this.flockX / this.flockCount, cy = this.flockY / this.flockCount;
          const flockStr = 0.18;
          goalX = this.x + Math.cos(this.wanderAngle) * 180 * (1 - flockStr) + (cx - this.x) * flockStr;
          goalY = this.y + Math.sin(this.wanderAngle) * 180 * (1 - flockStr) + (cy - this.y) * flockStr;
        } else {
          goalX = this.x + Math.cos(this.wanderAngle) * 180;
          goalY = this.y + Math.sin(this.wanderAngle) * 180;
        }
        drive = 0.38;
        break;
      }
      case 'graze':
        if (!this.target || this.target.dead) this.target = game.findFoodTargetForCreature(this, 380, true);
        if (this.target) { goalX = this.target.x; goalY = this.target.y; drive = 0.65; }
        else { this.wanderAngle += (Math.random() - 0.5) * 1.1 * dt; goalX = this.x + Math.cos(this.wanderAngle) * 140; goalY = this.y + Math.sin(this.wanderAngle) * 140; drive = 0.35; }
        break;
      case 'seekFood':
        if (this.target && !this.target.dead) {
          goalX = this.target.x;
          goalY = this.target.y;
          drive = 0.88;

          // Linger in food-rich patches rather than instantly leaving after
          // one chunk; this creates realistic local foraging behavior.
          const near = game.grid.query(this.target.x, this.target.y, 130, game._scratch);
          let fx = 0, fy = 0, fn = 0;
          for (let i = 0; i < near.length; i++) {
            const e = near[i];
            if (!e || e.dead || e.kind !== 'food') continue;
            if (this.diet === 'herbivore' && e.type !== 'plant') continue;
            if (this.diet === 'carnivore' && e.type !== 'meat') continue;
            fx += e.x; fy += e.y; fn++;
          }
          if (fn >= 3) {
            this.forageAnchorX = fx / fn;
            this.forageAnchorY = fy / fn;
            this.forageAnchorT = Math.max(this.forageAnchorT, Math.min(8, 2.2 + fn * 0.45));
          }
          if (this.forageAnchorT > 0) {
            this.forageAnchorT = Math.max(0, this.forageAnchorT - dt);
            goalX = goalX * 0.55 + this.forageAnchorX * 0.45;
            goalY = goalY * 0.55 + this.forageAnchorY * 0.45;
            drive = Math.min(drive, 0.72);
          }
        } else {
          this.wanderAngle += (Math.random() - 0.5) * 1.5 * dt;
          goalX = this.x + Math.cos(this.wanderAngle) * 220;
          goalY = this.y + Math.sin(this.wanderAngle) * 220;
          drive = 0.58;
        }
        break;
      case 'seekMate':
        if (this.target && !this.target.dead) {
          goalX = this.target.x;
          goalY = this.target.y;
          drive = 0.82;
        } else {
          this.state = 'seekFood';
        }
        break;
      case 'scavenge':
        if (this.target && (this.target.dead || this.target.kind === 'food')) { goalX = this.target.x; goalY = this.target.y; drive = 0.85; }
        else drive = 0.35;
        break;
      case 'hide': {
        // prefer rock crevices if any nearby
        const rock = game.nearestRockCrevice(this.x, this.y);
        goalX = rock ? rock.cx : this.territoryX;
        goalY = rock ? rock.cy : this.territoryY;
        drive = 0.22;
        break;
      }
      case 'patrol':
        goalX = this.territoryX; goalY = this.territoryY; drive = 0.65;
        break;
      case 'flee': {
        const t = this.target || p;
        let ax = this.x - t.x;
        let ay = this.y - t.y;
        const al = Math.hypot(ax, ay) || 1;
        ax /= al; ay /= al;
        const th = Math.atan2(t.vy || 0.001, t.vx || 0.001);
        const side = this.evadeBias || 1;
        const evadeA = Math.atan2(ay, ax) + side * 0.62;
        const blend = 0.64;
        const ex = Math.cos(evadeA) * blend + Math.cos(th + side * Math.PI * 0.5) * (1 - blend);
        const ey = Math.sin(evadeA) * blend + Math.sin(th + side * Math.PI * 0.5) * (1 - blend);
        goalX = this.x + ex * 420;
        goalY = this.y + ey * 420;
        drive = 1.3;
        break;
      }
      case 'escort': {
        // follow the player, protect them
        const dx2 = p.x - this.x, dy2 = p.y - this.y;
        const pd2 = Math.hypot(dx2, dy2);
        if (pd2 > T.ESCORT_RANGE * 0.5) {
          goalX = p.x - dx2 / pd2 * T.ESCORT_RANGE * 0.3;
          goalY = p.y - dy2 / pd2 * T.ESCORT_RANGE * 0.3;
          drive = 0.9;
        } else {
          // look for food nearby while escorting
          const food = game.findFood(this.x, this.y, 200, this);
          if (food) { goalX = food.x; goalY = food.y; drive = 0.65; }
          else { goalX = p.x; goalY = p.y; drive = 0.25; }
        }
        // attack nearby threats
        const nearby = game.grid.query(this.x, this.y, 200, game._scratch);
        for (const e of nearby) {
          if (e.kind !== 'creature' || e === this || e.dead || e.isEscort) continue;
          if (e.r < this.r * 1.5) {
            goalX = e.x; goalY = e.y; drive = 1.1;
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < this.r + e.r + 4 && this.attackCD <= 0) {
              e.takeDamage(this.biteDmg, 'escort', game);
              this.attackCD = 0.8;
            }
          }
        }
        break;
      }
      case 'huntCreature':
      case 'attack':
      case 'hunt': {
        const t = this.target || p;
        if (t.dead) { this.state = 'wander'; this.target = null; break; }
        goalX = t.x; goalY = t.y;
        drive = (this.state === 'attack') ? 1.2 : 1.0;
        const dpx = t.x - this.x, dpy = t.y - this.y;
        const d = Math.hypot(dpx, dpy);
        if (t === p && p.hatching) { this.state = 'wander'; break; } // don't attack hatching player
        if (d < this.r + (t.r || 8) + 4 && this.attackCD <= 0) {
          if (t === p) {
            let dmg = this.biteDmg * (1 + this.angry * 0.4);
            const overlap = this.r + p.r * 0.82 - d;
            p.takeDamage(dmg, this.name, game);
            if (overlap > 0) game.applyBodyBounce(this, p, overlap, clamp(dmg / 50, 0, 0.55));
            this.attackCD = 0.7;
            this.hunger -= 0.2;
            game.onCreatureHitPlayer(this);
            if (p.spikeDamage > 0) this.takeDamage(p.spikeDamage, 'recoil', game);
          } else if (t.kind === 'creature') {
            const dmg = this.biteDmg * (1 + this.angry * 0.3);
            const overlap = this.r + t.r * 0.82 - d;
            t.takeDamage(dmg, 'creature', game);
            if (overlap > 0) game.applyBodyBounce(this, t, overlap, clamp(dmg / 45, 0, 0.55));
            this.attackCD = 0.85;
            this.hunger -= 0.15;
            if (t.spikeDamage > 0) this.takeDamage(t.spikeDamage, 'recoil', game);
          }
        }
        break;
      }
    }

    // steer around rocks toward goal
    const avoid = game.getRockAvoidedGoal(this.x, this.y, goalX, goalY, this.r);
    goalX = avoid.x;
    goalY = avoid.y;

    // ─ Propulsion physics ─────────────────────────────────────────────────
    // Unified model for every creature: turn-then-thrust along the heading
    // with anisotropic drag. The propulsion profile only changes thrust
    // envelope, drag, and turn rate.
    const profile = PROPULSION_PROFILES[this.propulsion] || PROPULSION_PROFILES.glide;
    const growthMul = creatureGrowthMul(this);
    const baseSpeed = this.maxSpeed * growthMul;
    const baseAccel = this.accel * growthMul;

    // Arrival damping — ease off when nearing the goal so fast creatures
    // don't overshoot and have to U-turn (the previous "spinning" bug).
    let dx = goalX - this.x, dy = goalY - this.y;
    const len = Math.hypot(dx, dy);
    if (this.state !== 'flee') {
      const arrival = this.r + 28;
      if (len < arrival) drive *= Math.max(0.18, len / arrival);
    }

    // Turn heading toward the goal at a profile-specific rate. Scale by
    // current speed so near-stopped fish can't pivot faster than they swim.
    if (len > 0.5) {
      dx /= len; dy /= len;
      const goalAngle = Math.atan2(dy, dx);
      const aDelta = angDelta(this.angle, goalAngle);
      const sp = Math.hypot(this.vx, this.vy);
      const sizeFactor = 1 - clamp(this.r / 42, 0, 0.95) * 0.45;
      const speedScale = clamp(0.35 + sp / Math.max(12, baseSpeed * 0.6), 0.35, 1);
      const turnRate = profile.turnRate * sizeFactor * speedScale * (0.7 + growthMul * 0.6);
      this.angle += clamp(aDelta, -turnRate * dt, turnRate * dt);
    }

    // Propulsion envelope — produces a thrust multiplier from the profile.
    // Larger creatures stroke less frequently.
    const sizeCadenceMul = clamp(1 + Math.max(0, this.r - 12) / 24, 1, 2.4);
    this._propulsionT = (this._propulsionT || 0) + dt;
    let thrustMul = profile.cruiseStrength;
    if (profile.cycle > 0) {
      const effCycle = profile.cycle * sizeCadenceMul;
      const t = this._propulsionT % effCycle;
      const burstDur = effCycle * profile.burstFrac;
      if (t < burstDur) {
        // Half-sine impulse: smooth ramp-up, peak, ramp-down.
        const u = t / burstDur;
        const env = Math.sin(u * Math.PI);
        thrustMul = profile.cruiseStrength + (profile.burstStrength - profile.cruiseStrength) * env;
      } else if (this.propulsion === 'wriggle') {
        // Between strokes, wriggle keeps a faint sinusoidal background so the
        // body never fully stalls.
        const u = (t - burstDur) / Math.max(0.0001, effCycle - burstDur);
        thrustMul = profile.cruiseStrength * (0.55 + 0.45 * Math.sin(u * Math.PI * 2));
      }
    }
    // Predators leaning into a strike push a little harder.
    if (this.state === 'attack' || this.state === 'hunt' || this.state === 'huntCreature') {
      thrustMul *= 1.15;
    }

    // Thrust along heading, gated by alignment so creatures don't accelerate
    // sideways while mid-turn.
    const hx = Math.cos(this.angle), hy = Math.sin(this.angle);
    const headingAlign = len > 0.5 ? Math.max(0, dx * hx + dy * hy) : 1;
    const thrust = baseAccel * drive * thrustMul * (0.35 + 0.65 * headingAlign);
    this.vx += hx * thrust * dt;
    this.vy += hy * thrust * dt;

    // Lateral (sideways) slip damping — water resists perpendicular motion.
    const lateralV = this.vx * -hy + this.vy * hx;
    const slipDamp = Math.min(1, profile.slipDamp * dt);
    this.vx -= -hy * lateralV * slipDamp;
    this.vy -=  hx * lateralV * slipDamp;

    // Forward drag.
    const fr = Math.max(0, 1 - profile.drag * dt);
    this.vx *= fr; this.vy *= fr;

    // Environmental current.
    const cur = game.getCurrentVectorAt(this.x, this.y);
    this.vx += cur.x * dt * 0.2;
    this.vy += cur.y * dt * 0.2;

    // Speed clamp — burst lets a creature briefly exceed cruise speed. Drive
    // already attenuates thrust, so it should NOT also clamp max speed (that
    // double-penalized wandering creatures into a near-frozen crawl).
    const burstClampBoost = (this.propulsion === 'burst' && thrustMul > 1.5) ? 1.45 : 1.0;
    const v = Math.hypot(this.vx, this.vy);
    const mv = baseSpeed * burstClampBoost;
    if (v > mv) { this.vx = this.vx / v * mv; this.vy = this.vy / v * mv; }

    // Unstick helper for dense plant/rock pockets.
    this._stuckT = this._stuckT || 0;
    if (len > this.r + 42 && drive > 0.55 && v < Math.max(10, this.maxSpeed * 0.18)) {
      this._stuckT += dt;
      if (this._stuckT > 0.75) {
        const side = ((this.evadeBias || 1) >= 0) ? 1 : -1;
        const px = -hy * side;
        const py = hx * side;
        const nudge = Math.max(22, this.maxSpeed * 0.2);
        this.vx += hx * nudge * 0.65 + px * nudge;
        this.vy += hy * nudge * 0.65 + py * nudge;
        this.angle += side * 0.32;
        this._stuckT = 0.15;
      }
    } else {
      this._stuckT = Math.max(0, this._stuckT - dt * 1.4);
    }
  }

  draw(ctx, camX, camY, w, h) {
    const sx = this.x - camX + w * 0.5;
    const sy = this.y - camY + h * 0.5;
    const g = window.GAME;
    if (g) {
      const rr = g.getRenderRadius() + this.r + 120;
      if (dist2(this.x, this.y, g.camX, g.camY) > rr * rr) return;
    }
    const r = this.r;
    const deathFade = 1;

    // legendary aura
    if (this.legendary) {
      const grad = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 3);
      grad.addColorStop(0, hslaCSS(this.hue, 70, 70, 0.16 * deathFade));
      grad.addColorStop(1, hslaCSS(this.hue, 70, 50, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(sx, sy, r * 3, 0, TAU); ctx.fill();
    }

    if (this.growthPulse > 0) {
      ctx.strokeStyle = hslaCSS(140, 70, 65, 0.45 * this.growthPulse);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(sx, sy, r * (1.25 + (1 - this.growthPulse) * 0.4), 0, TAU);
      ctx.stroke();
    }

    if (this.eatenMark > 0) {
      ctx.strokeStyle = hslaCSS(350, 85, 68, 0.55 * this.eatenMark);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.35, 0, TAU);
      ctx.stroke();
    }

    if (this.hitFlash > 0) {
      ctx.fillStyle = hslaCSS(0, 90, 70, 0.42 * this.hitFlash);
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.35, 0, TAU);
      ctx.fill();
    }

    // wobble: gentle breathing / idle oscillation
    const wobble = 1 + 0.045 * Math.sin(performance.now() * 0.0018 + this.bornAt * 7.3);
    const wr = r * wobble;
    const hitMorph = this.hitFlash * 0.12;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    if (this.hitFlash > 0) {
      ctx.translate(-r * 0.14 * this.hitFlash, 0);
      ctx.scale(1 + hitMorph, 1 - hitMorph * 0.6);
    }

  // body - fish-body bezier silhouette with spine-bend
    const bodyHue = lerp(this.hue, 0, clamp(this.hitFlash * 0.6, 0, 1));
    const bodySat = lerp(this.sat, 85, clamp(this.hitFlash * 0.7, 0, 1));
    const bodyLight = lerp(this.light, 62, clamp(this.hitFlash * 0.55, 0, 1));
    const gLevelC = this.growthLevel || 0;
    const spineExtC = 1 + Math.min(gLevelC, 9) * 0.022;   // spine visibly extends with growth level
    const cmotion = clamp(Math.hypot(this.vx || 0, this.vy || 0) / Math.max(1, this.maxSpeed), 0, 1);
    const crx = wr * (this.body==='long'?1.38:this.body==='oval'?1.14:this.body==='soft'?0.96:1.04) * spineExtC * (1 + cmotion * 0.07);
    const cry = wr * (this.body==='long'?0.60:this.body==='oval'?0.80:this.body==='soft'?0.94:0.80) * (1 + Math.min(gLevelC, 9) * 0.006) * (1 - cmotion * 0.04);
    const ctailX  = -(crx + r * 0.16);
    const cheadX  =  crx * 0.80;
    const cheadTip = crx + r * 0.40;
    const tailShiftC = (this._bendTail || 0) * crx * 0.42;
    const midShiftC  = (this._bendMid  || 0) * crx * 0.18;
    const ctailW = cry * 0.46;
    ctx.fillStyle   = hslaCSS(bodyHue, bodySat, bodyLight, 0.9 * deathFade);
    ctx.strokeStyle = hslaCSS(this.hue, this.sat, Math.min(100, this.light + 18), 0.75 * deathFade);
    ctx.lineWidth   = Math.max(0.8, r * 0.038);
    ctx.beginPath();
    ctx.moveTo(ctailX, ctailW + tailShiftC);
    ctx.bezierCurveTo(ctailX * 0.62 + midShiftC * 0.5, cry * 0.72 + tailShiftC * 0.5,
                      -crx * 0.10 + midShiftC,          cry,
                       cheadX,                           cry * 0.30);
    ctx.bezierCurveTo(cheadX * 0.55, cry * 0.60, cheadTip, cry * 0.30, cheadTip, 0);
    ctx.bezierCurveTo(cheadTip, -cry * 0.30, cheadX * 0.55, -cry * 0.60, cheadX, -cry * 0.30);
    ctx.bezierCurveTo(-crx * 0.10 - midShiftC, -cry,
                       ctailX * 0.62 - midShiftC * 0.5, -cry * 0.72 - tailShiftC * 0.5,
                       ctailX, -(ctailW + tailShiftC));
    ctx.lineTo(ctailX, ctailW + tailShiftC);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    const ceyeX = cheadX * 0.72, ceyeY = -cry * 0.38;
    ctx.fillStyle = hslaCSS(0, 0, 96, 0.88 * deathFade);
    ctx.beginPath(); ctx.arc(ceyeX, ceyeY, r * 0.145, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(this.hue + 20, 65, 45, 0.85 * deathFade);
    ctx.beginPath(); ctx.arc(ceyeX + r*0.022, ceyeY, r * 0.092, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(0, 0, 8, deathFade);
    ctx.beginPath(); ctx.arc(ceyeX + r*0.032, ceyeY, r * 0.052, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(0, 0, 100, 0.82 * deathFade);
    ctx.beginPath(); ctx.arc(ceyeX + r*0.048, ceyeY - r*0.032, r * 0.024, 0, TAU); ctx.fill();

    ctx.strokeStyle = hslaCSS(this.hue + 10, 50, 35, 0.50 * deathFade);
    ctx.lineWidth = Math.max(0.5, r * 0.025);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cheadTip - r*0.035, -r*0.048);
    ctx.lineTo(cheadTip + r*0.018,  r*0.048);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.fillStyle = hslaCSS(this.hue, this.sat - 10, Math.max(20, this.light - 25), 0.4 * deathFade);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();

    for (const part of this.parts) this.drawPart(ctx, part, r, deathFade);

    ctx.restore();

    // When the procedural body is enabled, let it draw on top.
    // (P0: no-op — real drawing begins in P1.)
    if (T.PROC_BODY) this.procBody.draw(ctx, camX, camY, w, h);

    if (!this.dead && this.hp < this.maxHP) {
      const bw = Math.max(16, r * 2.1);
      const bh = 3.5;
      const bx = sx - bw * 0.5;
      const by = sy - r - 12;
      const hpPct = clamp(this.hp / this.maxHP, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = hslaCSS(350, 80, 66, 0.95);
      ctx.fillRect(bx, by, bw * hpPct, bh);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(bx, by, bw, bh);
    }

    // name tag for legendary
    if (this.legendary && !this.dead) {
      ctx.fillStyle = hslaCSS(this.hue, 60, 85, 0.85);
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.name, sx, sy - r - 14);
    }
  }

  drawPart(ctx, part, r, fade) {
    switch (part) {
      case 'cilia': {
        ctx.strokeStyle = hslaCSS(this.hue, this.sat, this.light + 10, 0.5 * fade);
        ctx.lineWidth = Math.max(0.6, r * 0.055);
        ctx.lineCap = 'round';
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * TAU;
          const t = Math.sin(performance.now() * 0.0045 + this.bornAt * 5 + i * 1.1) * r * 0.28;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
          ctx.lineTo(Math.cos(a) * r * 1.55 + t * Math.sin(a + 1.2),
                     Math.sin(a) * r * 1.55 - t * Math.cos(a + 1.2));
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        break;
      }
      case 'tail': {
        const fl = r * 0.82, fw = r * 0.70;
        ctx.fillStyle = hslaCSS(this.hue, this.sat - 8, this.light + 12, 0.78 * fade);
        ctx.strokeStyle = hslaCSS(this.hue, this.sat, this.light + 20, 0.5 * fade);
        ctx.lineWidth = Math.max(0.6, r * 0.03);
        for (const lobe of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-r * 0.85, lobe * r * 0.10);
          ctx.bezierCurveTo(-r * 1.05, lobe * fw * 0.55, -r * 1.30 - fl * 0.55, lobe * fw * 0.90, -(r * 0.85 + fl), lobe * fw);
          ctx.bezierCurveTo(-(r * 0.85 + fl * 0.60), lobe * fw * 0.55, -r * 1.05, lobe * r * 0.20, -r * 0.85, lobe * r * 0.10);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'eyespot': {
        const ex = r * 0.52, ey = -r * 0.40;
        ctx.fillStyle = hslaCSS(0, 0, 96, 0.90 * fade);
        ctx.beginPath(); ctx.arc(ex, ey, r * 0.22, 0, TAU); ctx.fill();
        ctx.strokeStyle = hslaCSS(this.hue + 25, 70, 50, 0.80 * fade);
        ctx.lineWidth = r * 0.055;
        ctx.beginPath(); ctx.arc(ex, ey, r * 0.135, 0, TAU); ctx.stroke();
        ctx.fillStyle = hslaCSS(0, 0, 8, fade);
        ctx.beginPath(); ctx.arc(ex + r*0.028, ey, r * 0.080, 0, TAU); ctx.fill();
        ctx.fillStyle = hslaCSS(0, 0, 100, 0.80 * fade);
        ctx.beginPath(); ctx.arc(ex + r*0.058, ey - r*0.045, r * 0.032, 0, TAU); ctx.fill();
        break;
      }
      case 'spike': {
        ctx.fillStyle = hslaCSS(this.hue - 15, this.sat + 10, this.light - 15, 0.82 * fade);
        ctx.strokeStyle = hslaCSS(this.hue - 10, this.sat, this.light, 0.45 * fade);
        ctx.lineWidth = Math.max(0.5, r * 0.025);
        for (let i = 0; i < 5; i++) {
          const bx = (i - 2) * r * 0.30;
          const h = r * (0.60 - Math.abs(i - 2) * 0.08);
          ctx.beginPath();
          ctx.moveTo(bx - r * 0.07, -r * 0.88);
          ctx.lineTo(bx, -(r * 0.88 + h));
          ctx.lineTo(bx + r * 0.07, -r * 0.88);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'plate': {
        ctx.strokeStyle = hslaCSS(this.hue + 10, this.sat - 15, this.light + 8, 0.55 * fade);
        ctx.lineWidth = Math.max(0.8, r * 0.05);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.08, r * 0.78, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.82, r * 0.58, 0, 0, TAU); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const rx = (i - 1) * r * 0.38;
          ctx.beginPath(); ctx.moveTo(rx, -r * 0.62); ctx.lineTo(rx + r*0.06, r * 0.62); ctx.stroke();
        }
        break;
      }
      case 'fin': {
        ctx.fillStyle = hslaCSS(this.hue, this.sat - 12, this.light + 18, 0.48 * fade);
        ctx.strokeStyle = hslaCSS(this.hue, this.sat - 5, this.light + 8, 0.55 * fade);
        ctx.lineWidth = Math.max(0.5, r * 0.025);
        for (const side of [-1, 1]) {
          const bx = -r * 0.10, by = side * r * 0.82;
          const tx = -r * 0.55, ty = side * r * 1.62;
          const ex = r * 0.35, ey = side * r * 0.85;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.bezierCurveTo(bx - r*0.12, side*r*1.10, tx - r*0.08, side*r*1.45, tx, ty);
          ctx.bezierCurveTo(tx + r*0.18, side*r*1.35, ex - r*0.05, side*r*1.05, ex, ey);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.strokeStyle = hslaCSS(this.hue, this.sat, this.light - 5, 0.30 * fade);
          ctx.lineWidth = Math.max(0.4, r * 0.018);
          for (let v = 1; v <= 3; v++) {
            const vt = v / 4;
            ctx.beginPath();
            ctx.moveTo(lerp(bx, tx, vt*0.6), lerp(by, ty, vt*0.6));
            ctx.lineTo(lerp(bx, ex, vt*0.8), lerp(by, ey, vt*0.8));
            ctx.stroke();
          }
          ctx.strokeStyle = hslaCSS(this.hue, this.sat - 5, this.light + 8, 0.55 * fade);
          ctx.lineWidth = Math.max(0.5, r * 0.025);
        }
        break;
      }
      case 'mandible': {
        ctx.fillStyle = hslaCSS(this.hue - 20, this.sat + 5, this.light - 10, 0.80 * fade);
        ctx.strokeStyle = hslaCSS(this.hue - 15, this.sat, this.light, 0.45 * fade);
        ctx.lineWidth = Math.max(0.5, r * 0.028);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(r * 0.72, side * r * 0.22);
          ctx.bezierCurveTo(r * 1.10, side * r * 0.38, r * 1.38, side * r * 0.55, r * 1.28, side * r * 0.22);
          ctx.bezierCurveTo(r * 1.38, side * r * 0.05, r * 1.05, side * r * 0.05, r * 0.72, side * r * 0.22);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'filtermouth': {
        ctx.strokeStyle = hslaCSS(this.hue + 15, 60, this.light + 20, 0.55 * fade);
        ctx.lineWidth = Math.max(0.5, r * 0.030);
        ctx.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI * 0.42 + i * (Math.PI * 0.84 / 6);
          const cx2 = r * 0.88 + r * 0.28 * Math.cos(a);
          const cy2 = r * 0.28 * Math.sin(a) * 0.6;
          ctx.beginPath();
          ctx.moveTo(r * 0.80, 0);
          ctx.quadraticCurveTo(cx2, cy2, r * 0.80 + r * 0.60 * Math.cos(a), r * 0.60 * Math.sin(a));
          ctx.stroke();
        }
        ctx.fillStyle = hslaCSS(this.hue + 15, 60, this.light + 15, 0.40 * fade);
        ctx.beginPath(); ctx.arc(r * 0.80, 0, r * 0.07, 0, TAU); ctx.fill();
        ctx.lineCap = 'butt';
        break;
      }
      case 'frill': {
        const frillPts = [];
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI * 0.75 + i * (Math.PI * 1.5 / 8);
          const inner = r * 0.90, outer = r * (1.42 + Math.sin(i * 2.2 + performance.now() * 0.003) * 0.06);
          frillPts.push({ ix: Math.cos(a) * inner, iy: Math.sin(a) * inner,
                          ox: Math.cos(a) * outer, oy: Math.sin(a) * outer });
        }
        ctx.fillStyle = hslaCSS(this.hue + 30, this.sat - 10, this.light + 22, 0.30 * fade);
        ctx.strokeStyle = hslaCSS(this.hue + 25, this.sat, this.light + 15, 0.55 * fade);
        ctx.lineWidth = Math.max(0.5, r * 0.022);
        ctx.beginPath();
        ctx.moveTo(frillPts[0].ix, frillPts[0].iy);
        for (const fp of frillPts) ctx.lineTo(fp.ox, fp.oy);
        ctx.lineTo(frillPts[frillPts.length-1].ix, frillPts[frillPts.length-1].iy);
        ctx.closePath();
        ctx.fill();
        for (const fp of frillPts) {
          ctx.beginPath(); ctx.moveTo(fp.ix, fp.iy); ctx.lineTo(fp.ox, fp.oy); ctx.stroke();
        }
        break;
      }
      case 'tendril': {
        ctx.strokeStyle = hslaCSS(this.hue, this.sat - 15, this.light + 18, 0.50 * fade);
        ctx.lineWidth = Math.max(0.5, r * 0.028);
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const w1 = Math.sin(performance.now() * 0.006 + this.bornAt * 6) * r * 0.30;
          const w2 = Math.sin(performance.now() * 0.0045 + this.bornAt * 4 + 1.8) * r * 0.25;
          ctx.beginPath();
          ctx.moveTo(-r * 0.82, side * r * 0.22);
          ctx.bezierCurveTo(-r * 1.20, side * r * 0.38 + w1 * 0.25,
                            -r * 1.58, side * r * 0.48 - w1 * 0.20, -r * 1.95, side * r * 0.35 + w2);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        break;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FOOD
// ─────────────────────────────────────────────────────────────────────────────
class Food extends Entity {
  constructor(x, y, type, biome, sizeOverride = null) {
    super(x, y);
    this.kind = 'food';
    this.foodId = Food._nextId = (Food._nextId || 0) + 1;
    this.type = type;
    this.r = sizeOverride != null ? sizeOverride : (type === 'meat' ? 4.5 + Math.random() * 2 : 3.5);
    this.hue = biome ? biome.nutrientH : 60;
    this.sat = biome ? biome.nutrientS : 80;
    this.light = biome ? biome.nutrientL : 70;
    if (type === 'meat') { this.hue = 355; this.sat = 80; this.light = 48; }
    if (type === 'plant') { this.hue = 116; this.sat = 66; this.light = 60; }
    this.t = Math.random() * TAU;
    this.life = 0;
    this.maxLife = type === 'meat' ? T.MEAT_DECAY_TIME : Infinity;
    this.vx = (Math.random() - 0.5) * (type === 'meat' ? 55 : 8);
    this.vy = (Math.random() - 0.5) * (type === 'meat' ? 55 : 8);
    this.links = new Set();
    this.linkCooldown = 0;
    this.relinkIntent = 0;
    this.linkOrigin = 'ambient';
    this.snapT = 0;
  }
  update(dt) {
    if (this.snapT > 0) this.snapT = Math.max(0, this.snapT - dt);
    if (this.linkCooldown > 0) this.linkCooldown = Math.max(0, this.linkCooldown - dt);
    if (this.relinkIntent > 0) this.relinkIntent = Math.max(0, this.relinkIntent - dt);
    if (this._magneticDelay > 0) this._magneticDelay = Math.max(0, this._magneticDelay - dt);
    if (this._sourceCooldown > 0) this._sourceCooldown = Math.max(0, this._sourceCooldown - dt);
    if (this.links && this.links.size > 0) {
      for (const o of this.links) {
        if (!o || o.dead || o === this) this.links.delete(o);
      }
    }
    this.t += dt * (0.8 + Math.abs(this.vx + this.vy) * 0.02);
    this.x += this.vx * dt; this.y += this.vy * dt;
    // gentle ambient float drift
    const swayMul = this.type === 'plant' ? 4.5 : 1.2;
    const damp = this.type === 'plant' ? 0.06 : 0.55;
    this.vx += Math.sin(this.t * 0.7) * swayMul * dt;
    this.vy += Math.cos(this.t * 0.9) * swayMul * dt;
    this.vx *= (1 - damp * dt); this.vy *= (1 - damp * dt);
    this.life += dt;
    if (this.life >= this.maxLife) this.dead = true;
  }
  draw(ctx, camX, camY, w, h) {
    const sx = this.x - camX + w * 0.5;
    // subtle vertical bob
    const bob = Math.sin(this.t * 2.2) * this.r * 0.18;
    const sy = this.y - camY + h * 0.5 + bob;
    const g = window.GAME;
    if (g) {
      const rr = g.getRenderRadius() + this.r + 100;
      if (dist2(this.x, this.y, g.camX, g.camY) > rr * rr) return;
    }

    // Draw connective filaments for linked plant-food chains.
    if (this.type === 'plant' && this.links && this.links.size > 0) {
      const sway = Math.sin(this.t * 3.1 + this.foodId * 0.37) * 0.8;
      for (const other of this.links) {
        if (!other || other.dead || other.type !== 'plant') continue;
        if ((this.foodId || 0) >= (other.foodId || 0)) continue;
        const ox = other.x - camX + w * 0.5;
        const obob = Math.sin(other.t * 2.2) * other.r * 0.18;
        const oy = other.y - camY + h * 0.5 + obob;
        const dx = ox - sx;
        const dy = oy - sy;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 180) continue;

        const nx = -dy / d;
        const ny = dx / d;
        const bow = clamp(d * 0.11 + sway, 3, 14);
        const cx = (sx + ox) * 0.5 + nx * bow;
        const cy = (sy + oy) * 0.5 + ny * bow;

        const filament = ctx.createLinearGradient(sx, sy, ox, oy);
        filament.addColorStop(0, hslaCSS(120, 70, 70, 0.22));
        filament.addColorStop(0.5, hslaCSS(136, 72, 76, 0.33));
        filament.addColorStop(1, hslaCSS(120, 70, 70, 0.22));
        ctx.strokeStyle = filament;
        ctx.lineWidth = clamp((this.r + other.r) * 0.16, 0.7, 1.4);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx, cy, ox, oy);
        ctx.stroke();

        const px = (sx + ox) * 0.5;
        const py = (sy + oy) * 0.5;
        ctx.fillStyle = hslaCSS(132, 68, 74, 0.26);
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, TAU);
        ctx.fill();
      }
    }

    const pulse = 0.92 + 0.08 * Math.sin(this.t * 4);
    // Soft halo
    const glowR = this.r * 2.2;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
    grad.addColorStop(0, hslaCSS(this.hue, this.sat, this.light, 0.35 * pulse));
    grad.addColorStop(1, hslaCSS(this.hue, this.sat, this.light, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, glowR, 0, TAU); ctx.fill();
    // Plant food: draw as a small rounded leaf rather than a plain circle.
    const r = this.r * pulse;
    if (this.type === 'plant') {
      // Leaf shape: two quadratic arcs forming a pointed oval, rotated by t.
      const leafLen = r * 2.2;
      const leafW  = r * 1.1;
      const ang = this.t * 0.55; // slowly rotates
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      // ink outline
      ctx.strokeStyle = '#1a1024';
      ctx.lineWidth = Math.max(1.2, r * 0.32);
      ctx.fillStyle = hslaCSS(this.hue, this.sat, Math.min(96, this.light + 12), 1);
      ctx.beginPath();
      ctx.moveTo(0, -leafLen * 0.5);
      ctx.quadraticCurveTo(leafW, 0, 0, leafLen * 0.5);
      ctx.quadraticCurveTo(-leafW, 0, 0, -leafLen * 0.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // midrib line
      ctx.strokeStyle = hslaCSS(this.hue + 20, 55, 85, 0.55);
      ctx.lineWidth = Math.max(0.5, r * 0.14);
      ctx.beginPath();
      ctx.moveTo(0, -leafLen * 0.44); ctx.lineTo(0, leafLen * 0.44);
      ctx.stroke();
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.22, -leafLen * 0.22, Math.max(0.5, r * 0.18), Math.max(0.5, r * 0.28), -0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else {
      // Meat / nutrient: original storybook chunk circle.
      ctx.strokeStyle = '#1a1024';
      ctx.lineWidth = Math.max(1.4, r * 0.34);
      ctx.fillStyle = hslaCSS(this.hue, this.sat, Math.min(96, this.light + 18), 1);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(sx - r * 0.35, sy - r * 0.35, Math.max(0.6, r * 0.25), 0, TAU); ctx.fill();
    }

    if (this.type === 'plant' && this.snapT > 0) {
      const k = clamp(this.snapT / 0.35, 0, 1);
      const ringR = this.r * (1.4 + (1 - k) * 1.4);
      ctx.strokeStyle = hslaCSS(148, 86, 78, 0.78 * k);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(sx, sy, ringR, 0, TAU);
      ctx.stroke();

      for (let i = 0; i < 4; i++) {
        const a = this.t * 3.8 + i * (TAU / 4);
        const ix = sx + Math.cos(a) * ringR * 0.65;
        const iy = sy + Math.sin(a) * ringR * 0.65;
        const ox = sx + Math.cos(a) * (ringR + 4 + (1 - k) * 8);
        const oy = sy + Math.sin(a) * (ringR + 4 + (1 - k) * 8);
        ctx.strokeStyle = hslaCSS(134, 78, 74, 0.62 * k);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(ox, oy);
        ctx.stroke();
      }
    }
  }
}

class PartShard extends Entity {
  constructor(x, y, partId) {
    super(x, y);
    this.kind = 'partshard';
    this.partId = partId;
    this.r = 5.5;
    this.vx = (Math.random() - 0.5) * 75;
    this.vy = (Math.random() - 0.5) * 75;
    this.t = Math.random() * TAU;
    this.life = 0;
    this.maxLife = 55;
  }

  update(dt) {
    this.life += dt;
    if (this.life >= this.maxLife) this.dead = true;
    this.t += dt * 2.1;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= (1 - 0.8 * dt);
    this.vy *= (1 - 0.8 * dt);
  }

  draw(ctx, camX, camY, w, h) {
    const sx = this.x - camX + w * 0.5;
    const sy = this.y - camY + h * 0.5;
    const glow = this.r * 3.1;
    const pulse = 0.78 + Math.sin(this.t * 2.2) * 0.22;
    const fade = clamp(1 - this.life / this.maxLife, 0, 1);

    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glow);
    grad.addColorStop(0, hslaCSS(192, 85, 70, 0.42 * fade));
    grad.addColorStop(1, hslaCSS(192, 85, 52, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, glow, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.t * 0.65);
    ctx.fillStyle = hslaCSS(192, 70, 74, 0.92 * fade);
    ctx.strokeStyle = hslaCSS(196, 80, 88, 0.85 * fade);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.r * pulse, 0);
    for (let i = 1; i < 5; i++) {
      const a = i / 5 * TAU;
      ctx.lineTo(Math.cos(a) * this.r * pulse, Math.sin(a) * this.r * pulse);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLANT STRUCTURES — procedural drifting plants built from clustered chunks
// ─────────────────────────────────────────────────────────────────────────────
// A PlantStructure is composed of one or more PlantNodes (central organic
// blobs formed from 5 clustered plant chunks). Each node sprouts branches of
// segments and leaves. Branch tips gently attract loose plant/food chunks,
// nodes grow internal chunks that eject when ripe, branches can sprout
// secondary branches when struck by chunks, and tips can connect plant↔plant
// once per structure. Plants may anchor to a single rock.
//
// Public shape kept compatible with the old PlantCluster: `x, y, dead, hue,
// scale, nodes[], links[]`, plus `update(dt, entities, game, drift)`,
// `eatFrom(...)`, `draw(...)`. Each entry in `nodes[]` exposes `{x, y, vx, vy,
// r, baseR, hp, maxHP, parent}` so renderer/AI/save code stays compatible.

const PLANT_TUNE = {
  // Five close plant chunks fuse into a new PlantStructure after a short
  // cohesion period. Tuned permissive so drifting plant matter actually forms
  // new plants in practice — the previous 7-chunk gate was too strict.
  CLUSTER_REQUIRED_CHUNKS: 5,
  CLUSTER_RADIUS: 44,
  CLUSTER_REQUIRED_TIME: 1.2,
  STARTING_BRANCH_COUNT: 3,
  STARTING_LEAVES_PER_BRANCH: 1,
  // Maximum branch length, in (segment+leaf) units. Per spec: a branch caps
  // at length 7. Sub-branches stay shorter so the silhouette stays readable.
  MAX_MAIN_BRANCH_LEAVES: 7,
  MAX_SECONDARY_BRANCH_LEAVES: 4,
  SEGMENT_LENGTH: 16,
  LEAF_BASE_R: 10,
  NODE_BASE_R: 9,
  BASE_GROWTH_RATE: 0.08,
  INTERNAL_CHUNK_EJECTION_FORCE: 42,
  BRANCH_ATTRACTION_RADIUS: 100,
  BRANCH_ATTRACTION_STRENGTH: 48,
  BRANCH_MAX_ATTRACTION_FORCE: 130,
  BRANCH_TIP_CONNECTION_RADIUS: 16,
  TIP_TO_TIP_ATTRACTION_RADIUS: 80,
  TIP_TO_TIP_ATTRACTION_STRENGTH: 26,
  TIP_CONNECT_RADIUS: 14,
  SECONDARY_SPAWN_LEAF_MIN: 2,
  SECONDARY_SPAWN_LEAF_MAX: 4,
  CREATURE_BRANCH_SLOWDOWN: 0.92,
  CREATURE_LEAF_SLOWDOWN: 0.95,
  // Intra-structure branch spacing: branches from the same plant gently repel
  // each other so they spread into an organic canopy instead of knotting.
  SAME_STRUCTURE_SEG_REPEL_RADIUS: 18,
  SAME_STRUCTURE_SEG_REPEL_FORCE: 92,
  SAME_STRUCTURE_TIP_REPEL_RADIUS: 34,
  SAME_STRUCTURE_TIP_REPEL_FORCE: 180,
  SAME_STRUCTURE_ANGLE_SEPARATION: 0.95,
  SAME_NODE_MIN_ANGLE: 0.62,
  SAME_NODE_SPREAD_STIFFNESS: 6.2,
  CHUNK_EJECT_CYCLE_SECONDS: 20,
  CHUNK_MAGNETIC_DELAY: 1.5,
  // Deterministic tip catch: if a chunk reaches the connection radius at the
  // branch tip, that branch grows. Cooldown still paces consecutive grabs so
  // a branch can't gain length faster than its sway period.
  BRANCH_GRAB_CHANCE: 1.0,
  BRANCH_GRAB_COOLDOWN: 2.5,
  LEAF_PUSH_FORCE: 240,
  ROCK_STICK_DAMP: 0.82,
  PLANT_SPAWN_RADIUS_MULTIPLIER: 2.5,
  MIN_PLANT_DISTANCE_FROM_PLAYER_MULTIPLIER: 0.35,
  MIN_DISTANCE_BETWEEN_PLANTS: 120,
  LEAF_GROWTH_INTERVAL: 5.5,     // seconds between natural leaf additions per branch
  SECONDARY_BRANCH_COOLDOWN: 18, // min seconds between sub-branch spawns per main branch
  MAX_SECONDARY_PER_MAIN: 2,     // max sub-branches allowed per main branch
  MAX_BRANCHES_PER_STRUCTURE: 7, // total branch cap (mains + subs) per PlantStructure
};

class PlantStructure {
  constructor(x, y, rng, scale = 1) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.structureId = PlantStructure._nextId = (PlantStructure._nextId || 0) + 1;
    this.colonyId = this.structureId;
    this.dead = false;
    this.scale = clamp(scale || 1, 1, 10);
    const R = rng || Math.random;
    this.rng = R;
    this.hue = 108 + R() * 28;
    this.life = 240 + R() * 280;
    this.flowPhase = R() * TAU;
    this.flowBias = R() * TAU;
    this.flowDrift = 0.7 + R() * 1.1;
    this.spin = 0;
    this.plantNodes = [];
    this.branches = [];
    this.nodes = [];
    this.links = [];
    this.tipLinks = [];
    this.connectedToPlant = false;
    this.connectedToRock = false;
    this.rootRock = null;
    this.growthFx = [];
    this.totalHP = 0;

    const node = this._spawnNode(x, y, R);
    for (let b = 0; b < PLANT_TUNE.STARTING_BRANCH_COUNT; b++) {
      const ang = (b / PLANT_TUNE.STARTING_BRANCH_COUNT) * TAU + (R() - 0.5) * 0.4;
      this._spawnBranch(node, ang, true, R);
    }
    this._refreshFlatNodes();
  }

  // ── Construction helpers ─────────────────────────────────────────────────
  _spawnNode(x, y, rng) {
    const baseR = PLANT_TUNE.NODE_BASE_R * Math.pow(this.scale, 0.55);
    const node = {
      kind: 'node',
      x, y, vx: 0, vy: 0,
      r: baseR, baseR,
      hp: 20 * Math.pow(this.scale, 0.6),
      maxHP: 20 * Math.pow(this.scale, 0.6),
      parent: null, angle: 0, length: 0,
      structure: this,
      branches: [],
      internalSlots: [],
      petalAngles: [],
    };
    for (let i = 0; i < 5; i++) {
      node.petalAngles.push((i / 5) * TAU + (rng() - 0.5) * 0.45);
    }
    this.plantNodes.push(node);
    this.totalHP += node.maxHP;
    return node;
  }

  _spawnBranch(node, originAngle, isMain, rng, originPos = null, parentBranch = null) {
    const branch = {
      kind: 'branch',
      node, parentBranch, isMain,
      maxLeaves: isMain ? PLANT_TUNE.MAX_MAIN_BRANCH_LEAVES : PLANT_TUNE.MAX_SECONDARY_BRANCH_LEAVES,
      originAngle,
      origin: originPos ? { x: originPos.x, y: originPos.y } : { x: node.x, y: node.y },
      segments: [], leaves: [],
      waveSpeed: 0.55 + rng() * 1.05,
      waveAmplitude: 0.08 + rng() * 0.16,
      phase: rng() * TAU,
      stiffness: 0.7 + rng() * 0.18,
      connected: false, done: false,
      parentSegRef: null,
    };
    node.branches.push(branch);
    this.branches.push(branch);
    node.internalSlots.push({ branch, progress: 0, angle: originAngle });
    this._growBranch(branch, rng);
    return branch;
  }

  _growBranch(branch, rng) {
    if (branch.done) return false;
    if (branch.leaves.length >= branch.maxLeaves) { branch.done = true; return false; }
    const last = branch.segments.length === 0
      ? branch.origin
      : branch.segments[branch.segments.length - 1];
    const segLen = PLANT_TUNE.SEGMENT_LENGTH * Math.pow(this.scale, 0.5);
    const wob = rng ? (rng() - 0.5) * 0.22 : 0;
    const ang = branch.originAngle + branch.segments.length * 0.07 + wob;
    const sx = last.x + Math.cos(ang) * segLen;
    const sy = last.y + Math.sin(ang) * segLen;
    const seg = { kind: 'segment', x: sx, y: sy, vx: 0, vy: 0, restLen: segLen, angle: ang };
    branch.segments.push(seg);
    const leafR = PLANT_TUNE.LEAF_BASE_R * Math.pow(this.scale, 0.5);
    // Leaves are kinematic obstacles anchored at the branch segment, not edible.
    const leafSide = (branch.segments.length - 1) % 2 === 0 ? 1 : -1;
    const leaf = {
      kind: 'leaf',
      branch,
      parent: seg,
      leafSide,
      r: leafR, baseR: leafR,
      // Kinematic position fields — set every frame from segment in _updateBranch
      baseX: sx, baseY: sy,
      tipX: sx, tipY: sy,
      perpAng: 0,
      x: sx, y: sy, // midpoint, updated each frame
      _swayKick: 0,
      hp: 12 * Math.pow(this.scale, 0.55),
      maxHP: 12 * Math.pow(this.scale, 0.55),
      structure: this,
    };
    branch.leaves.push(leaf);
    if (branch.leaves.length >= branch.maxLeaves) branch.done = true;
    // Bias the next chunk ejection from this branch's anchor node toward the
    // direction the branch just grew. One-shot — cleared after the next eject.
    if (branch.node) {
      branch.node._lastGrowthAngle = ang;
      branch.node._lastGrowthBias = 1;
    }
    this._refreshFlatNodes();
    return true;
  }

  _refreshFlatNodes() {
    const flat = [];
    for (const n of this.plantNodes) flat.push(n);
    for (const b of this.branches) for (const lf of b.leaves) flat.push(lf);
    this.nodes = flat;
  }

  _branchTip(branch) {
    if (branch.leaves.length > 0) return branch.leaves[branch.leaves.length - 1];
    if (branch.segments.length > 0) return branch.segments[branch.segments.length - 1];
    return null;
  }

  _emitGrowthFx(x, y, strength = 1, kind = 'eat') {
    if (this.growthFx.length >= 24) return;
    this.growthFx.push({ x, y, t: 0.9, life: 0.9, r: (5 + strength * 7) * Math.pow(this.scale || 1, 0.33), kind });
  }

  // ── Update loop ──────────────────────────────────────────────────────────
  update(dt, entities, game, drift = { x: 0, y: 0 }) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0 && this.plantNodes.length <= 1 && this.branches.every(b => b.leaves.length <= 1)) {
      this.dead = true; return;
    }

    const T_now = performance.now() * 0.001;
    // Water drag model for plant body: converge toward local flow velocity,
    // then damp. Attached plants are much heavier/slower in current.
    const driftMul = this.connectedToRock ? 0.16 : 0.42;
    const targetVX = drift.x * driftMul;
    const targetVY = drift.y * driftMul;
    const dragK = this.connectedToRock ? 4.4 : 2.2;
    const blend = 1 - Math.exp(-dragK * dt);
    this.vx += (targetVX - this.vx) * blend;
    this.vy += (targetVY - this.vy) * blend;
    const plantDamp = Math.max(0, 1 - dt * (this.connectedToRock ? 1.25 : 0.5));
    this.vx *= plantDamp;
    this.vy *= plantDamp;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.connectedToRock && this.rootRock && this.rootRock.rock && !this.rootRock.rock._removed) {
      const rock = this.rootRock.rock;
      // Attached systems share some velocity, but remain heavily damped.
      this.vx = this.vx * 0.78 + rock.vx * 0.22;
      this.vy = this.vy * 0.78 + rock.vy * 0.22;
      const tx = rock.x + this.rootRock.offsetX;
      const ty = rock.y + this.rootRock.offsetY;
      // Elastic tether: spring toward anchor point but still allows drift
      const tdx = tx - this.x, tdy = ty - this.y;
      const tDist = Math.hypot(tdx, tdy) || 0.001;
      const slack = rock.maxR * 0.8; // free range before spring activates
      if (tDist > slack) {
        const pull = Math.min(1, (tDist - slack) / (rock.maxR * 2));
        this.vx += (tdx / tDist) * pull * 26 * dt;
        this.vy += (tdy / tDist) * pull * 26 * dt;
      }
    }

    // Sway central nodes; root pinned to structure center.
    for (let i = 0; i < this.plantNodes.length; i++) {
      const n = this.plantNodes[i];
      const sway = Math.sin(T_now * 0.6 + n.x * 0.013) * 0.012;
      n.vx += sway + drift.x * dt * 0.42;
      n.vy += sway * 0.6 + drift.y * dt * 0.42;
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx * dt; n.y += n.vy * dt;
      if (i === 0) { n.x = this.x; n.y = this.y; n.vx = 0; n.vy = 0; }
      // gentle regen
      if (n.hp < n.maxHP) n.hp = Math.min(n.maxHP, n.hp + dt * 0.6);
      if (n.baseR && n.r < n.baseR) n.r = Math.min(n.baseR, n.r + dt * 0.45);
    }

    this._enforceNodeBranchSpread(dt);
    for (const branch of this.branches) this._updateBranch(branch, dt, T_now, drift);
    this._applyIntraBranchRepulsion(dt);

    this._updateInternalGrowth(dt, game);
    this._updateLeafGrowth(dt);
    this._updateTipInteractions(dt, game);
    // Tip attraction can re-densify branches; run spacing again after it.
    this._enforceNodeBranchSpread(dt * 0.8);
    this._applyIntraBranchRepulsion(dt * 0.8);
    if (entities && entities.length) this._updateCreatureInteractions(dt, entities);

    // Leaf regen.
    for (const branch of this.branches) {
      for (const lf of branch.leaves) {
        if (lf.hp < lf.maxHP) lf.hp = Math.min(lf.maxHP, lf.hp + dt * 0.6);
        if (lf.r < lf.baseR) lf.r = Math.min(lf.baseR, lf.r + dt * 0.45);
      }
    }

    // Tick FX.
    for (let i = this.growthFx.length - 1; i >= 0; i--) {
      const fx = this.growthFx[i];
      fx.t -= dt;
      if (fx.t <= 0) this.growthFx.splice(i, 1);
    }

    // Prune dead leaves; if a branch lost all leaves, drop it (it can regrow next merge).
    let pruned = false;
    for (const branch of this.branches) {
      const before = branch.leaves.length;
      branch.leaves = branch.leaves.filter(lf => !lf.dead);
      if (branch.leaves.length !== before) pruned = true;
    }
    if (pruned) this._refreshFlatNodes();

    if (this.plantNodes.length === 0) this.dead = true;
  }

  _updateBranch(branch, dt, T_now, drift) {
    const wave = Math.sin(T_now * branch.waveSpeed + branch.phase) * branch.waveAmplitude;
    // Recompute origin from (possibly moved) parent.
    if (!branch.parentBranch) {
      branch.origin.x = branch.node.x;
      branch.origin.y = branch.node.y;
    } else if (branch.parentSegRef && branch.parentSegRef.seg) {
      branch.origin.x = branch.parentSegRef.seg.x;
      branch.origin.y = branch.parentSegRef.seg.y;
    }
    let prevX = branch.origin.x;
    let prevY = branch.origin.y;
    const dmul = this.connectedToRock ? 0.25 : 0.55;
    for (let i = 0; i < branch.segments.length; i++) {
      const seg = branch.segments[i];
      const a = branch.originAngle + wave * (1 + i * 0.25) + i * 0.04;
      const targetX = prevX + Math.cos(a) * seg.restLen;
      const targetY = prevY + Math.sin(a) * seg.restLen;
      seg.vx += (targetX - seg.x) * branch.stiffness * dt * 12;
      seg.vy += (targetY - seg.y) * branch.stiffness * dt * 12;
      seg.vx += drift.x * dt * dmul;
      seg.vy += drift.y * dt * dmul;
      seg.vx *= 0.8; seg.vy *= 0.8;
      seg.x += seg.vx * dt; seg.y += seg.vy * dt;
      const dx = seg.x - prevX, dy = seg.y - prevY;
      const d = Math.hypot(dx, dy) || 0.0001;
      if (d > seg.restLen * 1.4) {
        const k = seg.restLen * 1.4 / d;
        seg.x = prevX + dx * k;
        seg.y = prevY + dy * k;
      }
      prevX = seg.x; prevY = seg.y;
    }
    // Leaves: kinematic — root pinned to segment, tip sways perpendicular to branch.
    for (let i = 0; i < branch.leaves.length; i++) {
      const lf = branch.leaves[i];
      const seg = branch.segments[Math.min(i, branch.segments.length - 1)];
      if (!seg) continue;
      const side = lf.leafSide !== undefined ? lf.leafSide : (i % 2 === 0 ? 1 : -1);
      // Smoothly ease the kick toward its target for a lazy, organic response.
      if (lf._swayKick) lf._swayKick *= Math.max(0, 1 - dt * 1.2);
      if (Math.abs(lf._swayKick || 0) < 0.001) lf._swayKick = 0;
      const sway = Math.sin(T_now * branch.waveSpeed + branch.phase + i * 0.7) * branch.waveAmplitude * 1.8
                 + (lf._swayKick || 0);
      const perpAng = branch.originAngle + side * HALF_PI + sway;
      const leafLen = lf.r * 3.0;
      lf.baseX = seg.x; lf.baseY = seg.y;
      lf.perpAng = perpAng;
      lf.tipX = seg.x + Math.cos(perpAng) * leafLen;
      lf.tipY = seg.y + Math.sin(perpAng) * leafLen;
      lf.x = seg.x + Math.cos(perpAng) * leafLen * 0.5; // midpoint for grid/collision
      lf.y = seg.y + Math.sin(perpAng) * leafLen * 0.5;
    }
  }

  _enforceNodeBranchSpread(dt) {
    const minGapBase = PLANT_TUNE.SAME_NODE_MIN_ANGLE;
    const stiff = PLANT_TUNE.SAME_NODE_SPREAD_STIFFNESS;
    for (const node of this.plantNodes) {
      if (!node || !node.branches || node.branches.length < 2) continue;
      const list = node.branches.filter(b => !b._removed);
      if (list.length < 2) continue;
      list.sort((a, b) => a.originAngle - b.originAngle);
      const n = list.length;
      const minGap = Math.min(TAU / n * 0.86, minGapBase);

      for (let i = 0; i < n; i++) {
        const a = list[i];
        const b = list[(i + 1) % n];
        const aa = ((a.originAngle % TAU) + TAU) % TAU;
        const bb = ((b.originAngle % TAU) + TAU) % TAU;
        let gap = bb - aa;
        if (gap <= 0) gap += TAU;
        if (gap >= minGap) continue;

        const deficit = minGap - gap;
        const corr = deficit * stiff * dt;
        a.originAngle -= corr * 0.5;
        b.originAngle += corr * 0.5;
      }

      for (let i = 0; i < n; i++) {
        const b = list[i];
        b.originAngle = ((b.originAngle % TAU) + TAU) % TAU;
      }
    }
  }

  _applyIntraBranchRepulsion(dt) {
    if (this.branches.length < 2) return;
    const scaleMul = Math.pow(this.scale || 1, 0.35);
    const segRadius = PLANT_TUNE.SAME_STRUCTURE_SEG_REPEL_RADIUS * scaleMul;
    const tipRadius = PLANT_TUNE.SAME_STRUCTURE_TIP_REPEL_RADIUS * scaleMul;
    const segR2 = segRadius * segRadius;
    const tipR2 = tipRadius * tipRadius;

    for (let i = 0; i < this.branches.length; i++) {
      const a = this.branches[i];
      if (!a || !a.segments.length) continue;
      const aTip = a.segments[a.segments.length - 1];

      for (let j = i + 1; j < this.branches.length; j++) {
        const b = this.branches[j];
        if (!b || !b.segments.length) continue;
        const bTip = b.segments[b.segments.length - 1];

        // Stronger repulsion at branch tips where visual knotting is worst.
        let dx = bTip.x - aTip.x;
        let dy = bTip.y - aTip.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < tipR2 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const falloff = 1 - d / tipRadius;
          const push = PLANT_TUNE.SAME_STRUCTURE_TIP_REPEL_FORCE * falloff * dt;
          aTip.vx -= nx * push; aTip.vy -= ny * push;
          bTip.vx += nx * push; bTip.vy += ny * push;

          // Slight angular uncurling for branches sharing the same node.
          if (a.node === b.node && a.node) {
            const cx = a.node.x, cy = a.node.y;
            const aa = Math.atan2(aTip.y - cy, aTip.x - cx);
            const bb = Math.atan2(bTip.y - cy, bTip.x - cx);
            let diff = ((bb - aa + Math.PI * 3) % TAU) - Math.PI;
            const turn = PLANT_TUNE.SAME_STRUCTURE_ANGLE_SEPARATION * falloff * dt;
            if (diff >= 0) {
              a.originAngle -= turn;
              b.originAngle += turn;
            } else {
              a.originAngle += turn;
              b.originAngle -= turn;
            }
          }
        }

        // Softer repulsion over branch segment bodies to prevent interweaving.
        for (let saIdx = 0; saIdx < a.segments.length; saIdx++) {
          const sa = a.segments[saIdx];
          for (let sbIdx = 0; sbIdx < b.segments.length; sbIdx++) {
            const sb = b.segments[sbIdx];
            dx = sb.x - sa.x;
            dy = sb.y - sa.y;
            d2 = dx * dx + dy * dy;
            if (d2 >= segR2 || d2 <= 0.0001) continue;

            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d;
            const falloff = 1 - d / segRadius;
            const push = PLANT_TUNE.SAME_STRUCTURE_SEG_REPEL_FORCE * falloff * dt;
            sa.vx -= nx * push; sa.vy -= ny * push;
            sb.vx += nx * push; sb.vy += ny * push;

            // Small positional correction reduces visible overlap jitter.
            const overlap = segRadius - d;
            if (overlap > 0) {
              const corr = overlap * 0.045;
              sa.x -= nx * corr; sa.y -= ny * corr;
              sb.x += nx * corr; sb.y += ny * corr;
            }
          }
        }
      }
    }
  }

  _updateInternalGrowth(dt, game) {
    for (const node of this.plantNodes) {
      if (!node.internalSlots.length) continue;
      const branchCount = node.internalSlots.length;
      // Per spec: a node ejects (CHUNK_EJECT_CYCLE_SECONDS / branches) chunks
      // over CHUNK_EJECT_CYCLE_SECONDS. Solving for period: each branch slot
      // fires once every `branchCount` seconds. More branches → fewer chunks.
      const period = Math.max(0.5, branchCount);
      if (node._ejectTimer === undefined) {
        node._ejectTimer = period * (this.rng ? this.rng() : Math.random()); // stagger start
        node._ejectBranchIdx = 0;
      }
      node._ejectTimer -= dt;
      if (node._ejectTimer <= 0) {
        node._ejectTimer += period; // stay in rhythm (don't reset to 0 to avoid drift)
        const slotIdx = node._ejectBranchIdx % branchCount;
        node._ejectBranchIdx = (node._ejectBranchIdx + 1) % branchCount;
        this._ejectInternalChunk(node, node.internalSlots[slotIdx], game);
      }
    }
  }

  // Branch ends only grow when they catch a drifting plant chunk via _tryGrabChunk.
  // This method now only handles the new-main-branch sprouting when a branch is done.
  _updateLeafGrowth(dt) {
    for (const branch of this.branches) {
      if (!branch.done) continue;
      // When a main branch fills to max, sprout a new main branch from its node
      // if we haven't hit the structure-wide branch cap.
      if (branch.isMain && !branch._spawnedNew &&
          this.branches.length < PLANT_TUNE.MAX_BRANCHES_PER_STRUCTURE) {
        branch._spawnedNew = true;
        const node = branch.node;
        const usedAngles = node.branches.map(b => b.originAngle);
        let bestAngle = branch.originAngle + Math.PI + (this.rng() - 0.5) * 0.7;
        let bestGap = -1;
        for (let t = 0; t < 8; t++) {
          const cand = this.rng() * TAU;
          let minGap = Infinity;
          for (const ua of usedAngles) {
            let diff = Math.abs(cand - ua) % TAU;
            if (diff > Math.PI) diff = TAU - diff;
            if (diff < minGap) minGap = diff;
          }
          if (minGap > bestGap) { bestGap = minGap; bestAngle = cand; }
        }
        this._spawnBranch(node, bestAngle, true, this.rng);
        this._emitGrowthFx(node.x, node.y, 1.1, 'sprout');
      }
    }
  }

  _ejectInternalChunk(node, slot, game) {
    if (!game || typeof game.spawnFood !== 'function') return;
    // Eject outward along this slot's branch direction with a random spread.
    // Using slot.angle avoids the degenerate case where node === plant center (atan2 returns 0).
    let a = (slot ? slot.angle : Math.random() * TAU) + (Math.random() - 0.5) * 1.1;
    // One-shot bias toward the most recent branch growth on this node. After
    // firing, the bias is cleared so subsequent ejections fall back to normal.
    if (node._lastGrowthBias) {
      const target = node._lastGrowthAngle;
      // Shortest angular delta in (-PI, PI].
      let diff = ((target - a + Math.PI * 3) % TAU) - Math.PI;
      a += diff * 0.55;
      node._lastGrowthBias = 0;
    }
    const dist = node.r + 4;
    const x = node.x + Math.cos(a) * dist;
    const y = node.y + Math.sin(a) * dist;
    const biome = (typeof biomeAt === 'function') ? biomeAt(Math.hypot(x, y)) : null;
    const f = game.spawnFood(x, y, 'plant', biome, 3 + Math.random() * 1.5);
    if (f) {
      const force = PLANT_TUNE.INTERNAL_CHUNK_EJECTION_FORCE;
      f.vx = Math.cos(a) * force + (Math.random() - 0.5) * 6;
      f.vy = Math.sin(a) * force + (Math.random() - 0.5) * 6;
      f.linkOrigin = 'plant';
      f.relinkIntent = 0;
      f._sourcePlant = this;
      f._sourcePlantId = this.structureId;
      f._sourceColonyId = this.colonyId;
      f._sourceCooldown = 1.4;
      f._magneticDelay = PLANT_TUNE.CHUNK_MAGNETIC_DELAY; // delay before branch tips can attract this chunk
    }
    this._emitGrowthFx(node.x, node.y, 0.9, 'eject');
  }

  _updateTipInteractions(dt, game) {
    if (!game) return;
    const grid = game.grid;
    const plants = game.plants;
    const scratch = game._scratch || [];

    for (const branch of this.branches) {
      const tip = this._branchTip(branch);
      if (!tip) continue;
      const radius = PLANT_TUNE.BRANCH_ATTRACTION_RADIUS;
      const r2 = radius * radius;
      const near = grid ? grid.query(tip.x, tip.y, radius, scratch) : game.foods;
      for (let i = 0; i < near.length; i++) {
        const o = near[i];
        if (!o || o.kind !== 'food' || o.dead) continue;
        if (o.type !== 'plant' && o.type !== 'meat') continue;
        // Skip chunks still in post-ejection magnetic delay — they drift freely first.
        if ((o._magneticDelay || 0) > 0) continue;
        // A branch must never feed on chunks emitted by its own plant’s nodes.
        // The chunk's sourcePlant pointer outlives the cooldown specifically so
        // we can enforce this rule for the chunk's entire lifetime.
        if (o._sourcePlant === this) continue;
        if (o._sourceColonyId !== undefined && o._sourceColonyId === this.colonyId) continue;
        const dx = tip.x - o.x;
        const dy = tip.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) || 0.001;
        const falloff = 1 - d / radius;
        let ax = (dx / d) * PLANT_TUNE.BRANCH_ATTRACTION_STRENGTH * falloff;
        let ay = (dy / d) * PLANT_TUNE.BRANCH_ATTRACTION_STRENGTH * falloff;
        const mag = Math.hypot(ax, ay);
        const cap = PLANT_TUNE.BRANCH_MAX_ATTRACTION_FORCE;
        if (mag > cap) { const s = cap / mag; ax *= s; ay *= s; }
        o.vx += ax * dt;
        o.vy += ay * dt;
        // Probabilistic grab at tip — not guaranteed, branch has a cooldown.
        if (!branch.done && d <= PLANT_TUNE.BRANCH_TIP_CONNECTION_RADIUS) {
          const now = performance.now() * 0.001;
          if ((branch._lastGrabT === undefined || now - branch._lastGrabT > PLANT_TUNE.BRANCH_GRAB_COOLDOWN)
              && Math.random() < PLANT_TUNE.BRANCH_GRAB_CHANCE) {
            if (this._tryGrabChunk(branch, o)) branch._lastGrabT = now;
          }
        }
      }
      if (branch.isMain && branch.segments.length >= PLANT_TUNE.SECONDARY_SPAWN_LEAF_MIN) {
        this._checkSecondarySpawn(branch, game);
      }
    }

    if (!this.connectedToPlant && plants && plants.length > 1) {
      this._updateTipToTipMerge(dt, plants);
    }

    if (!this.connectedToRock && game.rocks && game.rocks.length) {
      this._checkRockAttachment(game.rocks);
    }
  }

  _tryGrabChunk(branch, chunk) {
    // Final guard: this structure may never consume chunks emitted from its
    // own node network, even if a caller forgets to prefilter candidates.
    if (chunk && (
      chunk._sourcePlant === this ||
      chunk._sourcePlantId === this.structureId ||
      (chunk._sourceColonyId !== undefined && chunk._sourceColonyId === this.colonyId)
    )) return false;
    if (branch.done || branch.leaves.length >= branch.maxLeaves) { branch.done = true; return false; }
    chunk.dead = true;
    this._growBranch(branch, Math.random);
    this._emitGrowthFx(chunk.x, chunk.y, 1.0, 'grab');
    return true;
  }

  _checkSecondarySpawn(branch, game) {
    // Only main branches can sprout sub-branches; sub-branches cannot.
    if (!branch.isMain) return;
    const G = window.GROWTH_THRESHOLDS || {};
    const subTier = (G.subbranchTier != null) ? G.subbranchTier : PLANT_TUNE.SECONDARY_SPAWN_LEAF_MIN;
    // Per spec: branches can only sprout sub-branches once they have reached
    // tier `subbranchTier`, and only along segments above tier 2 (the area of
    // the branch above the second growth tier).
    if (branch.segments.length < subTier) return;
    // Cap at MAX_SECONDARY_PER_MAIN sub-branches per main branch.
    const existingSubs = this.branches.filter(b => b.parentBranch === branch).length;
    if (existingSubs >= PLANT_TUNE.MAX_SECONDARY_PER_MAIN) return;
    // Cooldown: prevent rapid secondary branching.
    const now = performance.now() * 0.001;
    if (branch._lastSecondaryT !== undefined && (now - branch._lastSecondaryT) < PLANT_TUNE.SECONDARY_BRANCH_COOLDOWN) return;

    const minIdx = Math.max(2, PLANT_TUNE.SECONDARY_SPAWN_LEAF_MIN);
    const maxIdx = Math.min(PLANT_TUNE.SECONDARY_SPAWN_LEAF_MAX, branch.segments.length - 1);
    if (maxIdx < minIdx) return;
    const grid = game.grid;
    const scratch = game._scratch || [];
    for (let i = minIdx; i <= maxIdx; i++) {
      const seg = branch.segments[i];
      if (!seg) continue;
      const near = grid ? grid.query(seg.x, seg.y, 16, scratch) : game.foods;
      for (let j = 0; j < near.length; j++) {
        const o = near[j];
        if (!o || o.kind !== 'food' || o.dead || o.type !== 'plant') continue;
        // Secondary growth cannot consume chunks emitted by this same structure.
        if (o._sourcePlant === this) continue;
        if (o._sourceColonyId !== undefined && o._sourceColonyId === this.colonyId) continue;
        const dx = o.x - seg.x, dy = o.y - seg.y;
        if (dx * dx + dy * dy > 12 * 12) continue;
        const side = Math.random() < 0.5 ? -1 : 1;
        const baseA = branch.originAngle + side * (Math.PI * 0.35 + Math.random() * 0.35);
        const sec = this._spawnBranch(branch.node, baseA, false, Math.random, { x: seg.x, y: seg.y }, branch);
        sec.parentSegRef = { branch, seg };
        o.dead = true;
        branch._lastSecondaryT = now;
        this._emitGrowthFx(seg.x, seg.y, 1.0, 'sprout');
        return;
      }
    }
  }

  _updateTipToTipMerge(dt, plants) {
    for (const other of plants) {
      if (other === this || other.dead || other.connectedToPlant) continue;
      const dx = other.x - this.x, dy = other.y - this.y;
      if (dx * dx + dy * dy > 360 * 360) continue;
      let bestA = null, bestB = null, bestD2 = PLANT_TUNE.TIP_TO_TIP_ATTRACTION_RADIUS * PLANT_TUNE.TIP_TO_TIP_ATTRACTION_RADIUS;
      for (const ba of this.branches) {
        const ta = this._branchTip(ba);
        if (!ta) continue;
        for (const bb of other.branches) {
          const tb = other._branchTip(bb);
          if (!tb) continue;
          const tdx = tb.x - ta.x, tdy = tb.y - ta.y;
          const td2 = tdx * tdx + tdy * tdy;
          if (td2 < bestD2) { bestD2 = td2; bestA = ta; bestB = tb; }
        }
      }
      if (!bestA || !bestB) continue;
      const d = Math.sqrt(bestD2) || 0.001;
      const falloff = 1 - d / PLANT_TUNE.TIP_TO_TIP_ATTRACTION_RADIUS;
      const ax = (bestB.x - bestA.x) / d * PLANT_TUNE.TIP_TO_TIP_ATTRACTION_STRENGTH * falloff;
      const ay = (bestB.y - bestA.y) / d * PLANT_TUNE.TIP_TO_TIP_ATTRACTION_STRENGTH * falloff;
      bestA.vx += ax * dt; bestA.vy += ay * dt;
      bestB.vx -= ax * dt; bestB.vy -= ay * dt;
      if (d <= PLANT_TUNE.TIP_CONNECT_RADIUS) {
        this.tipLinks.push({ other, a: bestA, b: bestB, rest: Math.max(10, d), t: 0 });
        other.tipLinks.push({ other: this, a: bestB, b: bestA, rest: Math.max(10, d), t: 0 });
        // Joined structures share a colony id for chunk source-gating.
        const mergedColony = Math.min(this.colonyId || this.structureId, other.colonyId || other.structureId);
        this.colonyId = mergedColony;
        other.colonyId = mergedColony;
        this.connectedToPlant = true;
        other.connectedToPlant = true;
        this._emitGrowthFx(bestA.x, bestA.y, 1.2, 'link');
        other._emitGrowthFx(bestB.x, bestB.y, 1.2, 'link');
        return;
      }
    }
    // Apply existing tip-link spring.
    for (const link of this.tipLinks) {
      if (!link.other || link.other.dead) continue;
      const dx = link.b.x - link.a.x, dy = link.b.y - link.a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const nx = dx / d, ny = dy / d;
      const stretch = d - link.rest;
      const k = 3.5;
      const corr = clamp(stretch * k * dt, -3, 3);
      link.a.vx += nx * corr * 0.5; link.a.vy += ny * corr * 0.5;
      link.b.vx -= nx * corr * 0.5; link.b.vy -= ny * corr * 0.5;
      link.t = (link.t || 0) + dt;
    }
  }

  _checkRockAttachment(rocks) {
    // Only one rock connection per structure, and one plant per rock.
    for (const branch of this.branches) {
      const tip = this._branchTip(branch);
      if (!tip) continue;
      for (const rock of rocks) {
        if (rock._connectedPlant && rock._connectedPlant !== this) continue; // rock already claimed
        const dx = tip.x - rock.x, dy = tip.y - rock.y;
        const d = Math.hypot(dx, dy);
        if (d > rock.maxR + 10) continue;
        const surfaceR = rock._effectiveRadiusForCircle(Math.atan2(dy, dx), d, 2);
        if (d <= surfaceR + 4) {
          this.connectedToRock = true;
          rock._connectedPlant = this;
          this.rootRock = {
            rock,
            offsetX: this.x - rock.x,
            offsetY: this.y - rock.y,
            anchorNode: branch.node,
            // Store surface contact offset from rock center for drawing the tether.
            anchorSurfOffX: tip.x - rock.x,
            anchorSurfOffY: tip.y - rock.y,
          };
          this._emitGrowthFx(tip.x, tip.y, 1.0, 'rock');
          return;
        }
      }
    }
  }

  _updateCreatureInteractions(dt, entities) {
    // Branches: hard collision below pushable tier; above tier they accept a
    // small portion of the creature's momentum so they can be shoved aside.
    const G = window.GROWTH_THRESHOLDS || {};
    const pushableTier = (G.branchPushable != null) ? G.branchPushable : 3;
    const branchSlowFactor = Math.pow(PLANT_TUNE.CREATURE_BRANCH_SLOWDOWN, dt * 60);
    const leafSlowFactor   = Math.pow(PLANT_TUNE.CREATURE_LEAF_SLOWDOWN,   dt * 60);
    for (let ei = 0; ei < entities.length; ei++) {
      const e = entities[ei];
      if (!e || e.dead || e.r < 2) continue;
      // A chunk emitted by this plant ignores its own structure entirely.
      if (e.kind === 'food' && e._sourcePlant === this) continue;
      const erx = e.r + 60;
      const dxp = e.x - this.x, dyp = e.y - this.y;
      if (dxp * dxp + dyp * dyp > erx * erx + 360 * 360) continue;
      let touchedBranch = false;
      let touchedLeaf   = false;
      for (const branch of this.branches) {
        // Quick reject vs tip.
        const tip = this._branchTip(branch);
        if (!tip) continue;
        const tdx = e.x - tip.x, tdy = e.y - tip.y;
        if (tdx * tdx + tdy * tdy > (e.r + 80) * (e.r + 80)) continue;
        // Branch segments: hard circle collision — push creature out.
        // If the branch has grown to/past the pushable tier, the creature's
        // impact also nudges the segment along the contact normal so larger
        // plants can be physically jostled.
        const segR = 6;
        const isPushable = branch.segments.length >= pushableTier;
        for (const seg of branch.segments) {
          const sdx = e.x - seg.x, sdy = e.y - seg.y;
          const dd = Math.hypot(sdx, sdy) || 0.001;
          const overlap = e.r + segR - dd;
          if (overlap > 0) {
            const nx = sdx / dd, ny = sdy / dd;
            e.x += nx * overlap * 0.7;
            e.y += ny * overlap * 0.7;
            const velDot = e.vx * nx + e.vy * ny;
            if (velDot < 0) { e.vx -= nx * velDot * 0.55; e.vy -= ny * velDot * 0.55; }
            if (isPushable && velDot < 0) {
              // Transfer a fraction of inward momentum to the segment.
              const push = -velDot * 0.18;
              seg.vx -= nx * push;
              seg.vy -= ny * push;
            }
            touchedBranch = true;
          }
        }
        // Leaves: drag only — creatures pass through but are slowed.
        for (const lf of branch.leaves) {
          if (lf.baseX === undefined) continue;
          const bx = lf.baseX, by = lf.baseY;
          const dax = lf.tipX - bx, day = lf.tipY - by;
          const lenSq = dax * dax + day * day || 1;
          const tc = clamp(((e.x - bx) * dax + (e.y - by) * day) / lenSq, 0, 1);
          const closestX = bx + tc * dax, closestY = by + tc * day;
          const dd = Math.hypot(e.x - closestX, e.y - closestY) || 0.001;
          if (dd < e.r + lf.r * 1.1) {
            touchedLeaf = true;
            const spd = Math.hypot(e.vx, e.vy);
            lf._swayKick = (lf._swayKick || 0) + lf.leafSide * clamp(spd / 180, 0.01, 0.14);
          }
        }
      }
      // Central plant nodes are collidable until this specific entity can
      // actually consume them. An entity “can consume” when it is a herb/omni
      // with growthLevel ≥ plantNodeEat AND the plant has matured (≥10 leaves).
      // Otherwise the node blocks the entity like a solid obstacle.
      const nodePlantMaturity = this.branches.reduce((s, b) => s + b.leaves.length, 0);
      const nodeEatTier = (G.plantNodeEat != null) ? G.plantNodeEat : 7;
      const eDiet = e.diet;
      const eGrowth = e.growthLevel || 0;
      const canEatNode = (eDiet === 'herbivore' || eDiet === 'omnivore')
        && eGrowth >= nodeEatTier && nodePlantMaturity >= 10;
      if (!canEatNode) {
        for (const n of this.plantNodes) {
          const sdx = e.x - n.x, sdy = e.y - n.y;
          const dd = Math.hypot(sdx, sdy) || 0.001;
          const overlap = e.r + n.r - dd;
          if (overlap > 0) {
            const nx = sdx / dd, ny = sdy / dd;
            e.x += nx * overlap;
            e.y += ny * overlap;
            const velDot = e.vx * nx + e.vy * ny;
            if (velDot < 0) { e.vx -= nx * velDot * 0.85; e.vy -= ny * velDot * 0.85; }
          }
        }
      }
      if (touchedBranch) { e.vx *= branchSlowFactor; e.vy *= branchSlowFactor; }
      if (touchedLeaf)   { e.vx *= leafSlowFactor;   e.vy *= leafSlowFactor;   }
    }
  }

  // Herbivore eating. `eaterGrowth` selects what can be consumed:
  //   - plantLeafEat → leaves become edible (slower, lower yield)
  //   - plantNodeEat → central node becomes edible (rich yield)
  // Plant chunks (the ejected food entities) are gated separately at the
  // caller; this function only handles parts attached to the structure.
  eatFrom(ex, ey, eaterR, game, minChunk = 0, impactVx = 0, impactVy = 0, eaterGrowth = 9) {
    const G = window.GROWTH_THRESHOLDS || {};
    const canEatLeaves = eaterGrowth >= ((G.plantLeafEat != null) ? G.plantLeafEat : 3);
    const canEatNode   = eaterGrowth >= ((G.plantNodeEat != null) ? G.plantNodeEat : 7);
    let best = null, bestD2 = Infinity, bestKind = null;
    // Nodes are protected until the plant has grown at least 10 leaves AND
    // the eater is mature enough.
    const plantMaturity = this.branches.reduce((s, b) => s + b.leaves.length, 0);
    if (canEatNode && plantMaturity >= 10) {
      for (const n of this.plantNodes) {
        if (n.r < minChunk) continue;
        const d2 = dist2(ex, ey, n.x, n.y);
        if (d2 < bestD2) { bestD2 = d2; best = n; bestKind = 'node'; }
      }
    }
    if (canEatLeaves) {
      for (const branch of this.branches) {
        for (const lf of branch.leaves) {
          if (lf.dead || lf.r < minChunk * 0.6) continue;
          const d2 = dist2(ex, ey, lf.x, lf.y);
          if (d2 < bestD2) { bestD2 = d2; best = lf; bestKind = 'leaf'; }
        }
      }
    }
    if (!best) return 0;
    const d = Math.sqrt(bestD2);
    const contact = bestKind === 'leaf' ? best.r * 1.1 : best.r + 12;
    if (d > eaterR + contact) return 0;
    // Leaves nibble slower (lower bite) than nodes \u2014 spec says they take more time than chunks.
    const biteMax = bestKind === 'leaf' ? 1.6 : 4;
    const bite = Math.min(best.hp, biteMax);
    best.hp -= bite;
    best.r = Math.max((best.baseR || best.r) * 0.55, best.r * 0.92);
    this._emitGrowthFx(best.x, best.y, Math.min(1.4, bite / 3), 'eat');
    if (game && game.particles) {
      game.particles.burst(best.x, best.y, 3, { speed: 30, life: 0.4, r: 1.4, h: this.hue, s: 70, l: 65 });
    }
    if (best.hp <= 0) {
      best.dead = true;
      if (best.kind === 'leaf' && best.branch) {
        // Removing a leaf shortens the branch by one segment.
        const idx = best.branch.leaves.indexOf(best);
        if (idx >= 0) {
          best.branch.leaves.splice(idx, 1);
          if (best.branch.segments[idx]) best.branch.segments.splice(idx, 1);
          best.branch.done = false;
        }
      } else if (best.kind === 'node') {
        // Eating a central node knocks loose chunks of plant food.
        const idx = this.plantNodes.indexOf(best);
        if (idx >= 0) this.plantNodes.splice(idx, 1);
      }
      this._refreshFlatNodes();
      if (this.plantNodes.length === 0) this.dead = true;
    }
    return bite * 3.5;
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  draw(ctx, camX, camY, w, h) {
    const T_now = performance.now() * 0.001;
    const ox = -camX + w * 0.5;
    const oy = -camY + h * 0.5;
    const fade = Math.min(1, this.life / 8);
    const INK = '#1a1024';

    // Rock-anchor tether — drawn as an organic root from rock surface to plant base.
    if (this.connectedToRock && this.rootRock && this.rootRock.rock && !this.rootRock.rock._removed) {
      const rock = this.rootRock.rock;
      // Start at the stored surface contact point on the rock.
      const rr = this.rootRock;
      const ax = rock.x + (rr.anchorSurfOffX || 0) + ox;
      const ay = rock.y + (rr.anchorSurfOffY || 0) + oy;
      const bx = this.x + ox;
      const by = this.y + oy;
      const dx = bx - ax, dy = by - ay;
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;
      // Two control points give the vine a lazy S-curve sway.
      const sway = Math.sin(T_now * 0.55 + this.flowPhase) * clamp(d * 0.14, 4, 22);
      const c1x = ax + dx * 0.3 + nx * sway;
      const c1y = ay + dy * 0.3 + ny * sway;
      const c2x = ax + dx * 0.7 - nx * sway * 0.6;
      const c2y = ay + dy * 0.7 - ny * sway * 0.6;
      // Thick ink shadow
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(18,8,28,0.55)';
      ctx.lineWidth = 4.8;
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by); ctx.stroke();
      // Root fill — warm brown-green vine
      ctx.strokeStyle = hslaCSS(this.hue - 30, 44, 26, 1);
      ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by); ctx.stroke();
      // Bright highlight seam
      ctx.strokeStyle = hslaCSS(this.hue - 10, 55, 48, 0.45);
      ctx.lineWidth = 1.0;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by); ctx.stroke();
      // Small knot dots along the vine at 25% / 50% / 75%
      for (const t of [0.25, 0.5, 0.75]) {
        const mt = 1 - t;
        const kx = mt*mt*mt*ax + 3*mt*mt*t*c1x + 3*mt*t*t*c2x + t*t*t*bx;
        const ky = mt*mt*mt*ay + 3*mt*mt*t*c1y + 3*mt*t*t*c2y + t*t*t*by;
        ctx.fillStyle = hslaCSS(this.hue - 24, 38, 34, 0.8);
        ctx.beginPath(); ctx.arc(kx, ky, 2.1, 0, TAU); ctx.fill();
      }
      // Anchor pad where vine meets rock surface
      ctx.fillStyle = hslaCSS(this.hue - 32, 34, 22, 0.9);
      ctx.beginPath(); ctx.arc(ax, ay, 4.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ax, ay, 3.0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Plant-to-plant tether (drawn before stems).
    for (const link of this.tipLinks) {
      if (!link.other || link.other.dead) continue;
      // Draw only once per pair (lower-x plant draws).
      if (this.x > link.other.x) continue;
      const ax = link.a.x + ox, ay = link.a.y + oy;
      const bx = link.b.x + ox, by = link.b.y + oy;
      const dx = bx - ax, dy = by - ay;
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;
      const bow = Math.min(14, d * 0.18);
      const cx = (ax + bx) * 0.5 + nx * bow * 0.4;
      const cy = (ay + by) * 0.5 + ny * bow * 0.4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4.4;
      ctx.globalAlpha = 0.85 * fade;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cx, cy, bx, by); ctx.stroke();
      ctx.strokeStyle = hslaCSS(((this.hue + link.other.hue) * 0.5) - 18, 46, 32, 1);
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cx, cy, bx, by); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Stems — bold ink outline + flat green fill, drawn from origin outward.
    ctx.lineCap = 'round';
    for (const branch of this.branches) {
      let prevX = branch.origin.x + ox;
      let prevY = branch.origin.y + oy;
      for (let i = 0; i < branch.segments.length; i++) {
        const seg = branch.segments[i];
        const sx = seg.x + ox, sy = seg.y + oy;
        const taper = 1 - i / Math.max(1, branch.maxLeaves) * 0.35;
        const stemW = Math.max(2, (branch.isMain ? 3.4 : 2.6) * taper * Math.pow(this.scale, 0.35));
        ctx.strokeStyle = INK;
        ctx.globalAlpha = 0.92 * fade;
        ctx.lineWidth = stemW + 1.6;
        ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.strokeStyle = hslaCSS(this.hue - 20, 50, 30, 1);
        ctx.lineWidth = stemW;
        ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(sx, sy); ctx.stroke();
        prevX = sx; prevY = sy;
      }
    }
    ctx.globalAlpha = 1;

    // Central nodes — chunky storybook blob with 5 petal bumps.
    for (const node of this.plantNodes) {
      const sx = node.x + ox, sy = node.y + oy;
      const r = node.r;
      // outer ink blob (5 petals)
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.92 * fade;
      ctx.beginPath();
      for (let i = 0; i < node.petalAngles.length; i++) {
        const pa = node.petalAngles[i] + Math.sin(T_now * 0.7 + i) * 0.05;
        const px = sx + Math.cos(pa) * (r + 1.6);
        const py = sy + Math.sin(pa) * (r + 1.6);
        ctx.moveTo(px + r * 0.8, py);
        ctx.arc(px, py, r * 0.78, 0, TAU);
      }
      ctx.fill();
      // bright green petals
      ctx.fillStyle = hslaCSS(this.hue, 64, 56, 1);
      ctx.globalAlpha = fade;
      ctx.beginPath();
      for (let i = 0; i < node.petalAngles.length; i++) {
        const pa = node.petalAngles[i] + Math.sin(T_now * 0.7 + i) * 0.05;
        const px = sx + Math.cos(pa) * (r + 1.0);
        const py = sy + Math.sin(pa) * (r + 1.0);
        ctx.moveTo(px + r * 0.65, py);
        ctx.arc(px, py, r * 0.65, 0, TAU);
      }
      ctx.fill();
      // center hub
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.7 + 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = hslaCSS(this.hue + 14, 70, 64, 1);
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.7, 0, TAU); ctx.fill();
      // internal growth indicator: small inner pip per slot, sized by progress
      for (let i = 0; i < node.internalSlots.length; i++) {
        const slot = node.internalSlots[i];
        const a = slot.angle + Math.sin(T_now * 1.2 + i) * 0.15;
        const ix = sx + Math.cos(a) * r * 0.35;
        const iy = sy + Math.sin(a) * r * 0.35;
        const pipR = Math.max(0.6, slot.progress * r * 0.4);
        ctx.fillStyle = hslaCSS(this.hue + 30, 80, 78, 0.9);
        ctx.beginPath(); ctx.arc(ix, iy, pipR, 0, TAU); ctx.fill();
      }
      // sparkle
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.35, Math.max(1.0, r * 0.18), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Leaves — rooted at branch segment, pointed-oval extending perpendicular outward.
    for (const branch of this.branches) {
      for (let i = 0; i < branch.leaves.length; i++) {
        const lf = branch.leaves[i];
        if (lf.baseX === undefined) continue;
        const bsx = lf.baseX + ox, bsy = lf.baseY + oy;
        const hpFrac = clamp(lf.hp / lf.maxHP, 0, 1);
        const pulse = 0.95 + 0.05 * Math.sin(T_now * 1.1 + i * 1.3);
        const leafLen = lf.r * 3.0 * pulse;
        const leafW   = lf.r * 1.0 * pulse;
        ctx.save();
        ctx.translate(bsx, bsy);
        ctx.rotate(lf.perpAng); // extends in +x direction from root
        ctx.globalAlpha = fade;
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.1, lf.r * 0.22);
        ctx.fillStyle = hslaCSS(this.hue, 62, 50 + hpFrac * 14, 1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(leafLen * 0.5, leafW, leafLen, 0);
        ctx.quadraticCurveTo(leafLen * 0.5, -leafW, 0, 0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // midrib
        ctx.strokeStyle = hslaCSS(this.hue + 20, 55, 85, 0.55);
        ctx.lineWidth = Math.max(0.4, lf.r * 0.1);
        ctx.beginPath();
        ctx.moveTo(leafLen * 0.05, 0); ctx.lineTo(leafLen * 0.9, 0);
        ctx.stroke();
        // highlight
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(leafLen * 0.3, -leafW * 0.38, Math.max(0.4, leafLen * 0.1), Math.max(0.3, lf.r * 0.2), -0.15, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // Growth FX — soft expanding ring + sparkle.
    for (let i = 0; i < this.growthFx.length; i++) {
      const fx = this.growthFx[i];
      const k = clamp(fx.t / fx.life, 0, 1);
      const fadeIn = clamp((1 - k) / 0.22, 0, 1);
      const r = fx.r * (1 + (1 - k) * 0.85);
      const a = 0.55 * fadeIn * k * fade;
      const cx = fx.x + ox, cy = fx.y + oy;
      const hueShift = fx.kind === 'link' ? -8 : fx.kind === 'rock' ? -30 : fx.kind === 'sprout' ? 20 : fx.kind === 'grab' ? 24 : 14;
      ctx.strokeStyle = hslaCSS(this.hue + hueShift, 70, 60, a);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.7).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.1, r * 0.18), 0, TAU); ctx.fill();
    }
  }
}

// Back-compat alias — older save/spawn references may still use this name.
const PlantCluster = PlantStructure;

// ─────────────────────────────────────────────────────────────────────────────
// ROCK — procedural polygon rocks with crevices
// ─────────────────────────────────────────────────────────────────────────────
class Rock {
  constructor(x, y, rng, ring = 1) {
    this.x = x; this.y = y;
    const sides = 7 + Math.floor(rng() * 6);
    // Gentler outward scaling to keep far rings traversable.
    const tier = Math.max(0, Math.floor((ring - 1) / 6));
    const outwardMul = Math.min(2.1, 1 + tier * 0.22);
    const innerDampen = ring <= 2 ? 0.45 : ring <= 4 ? 0.62 : ring <= 8 ? 0.82 : 0.95;
    const lateRingSoftener = ring >= 8 ? Math.max(0.62, 1 - (ring - 8) * 0.02) : 1;
    const sizeMul = (0.72 + rng() * 0.92) * outwardMul * innerDampen * lateRingSoftener;
    const baseR = clamp((24 + rng() * 30) * sizeMul, 18, 176);
    this.r = baseR;
    this.verts = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU + (rng() - 0.5) * (TAU / sides) * 0.7;
      const rr = baseR * (0.55 + rng() * 0.55);
      this.verts.push({ a, r: rr });
    }
    this.verts.sort((a, b) => a.a - b.a);
    // Crevice: one concave notch where creatures can shelter
    const crevIdx = Math.floor(rng() * sides);
    const crevDepth = 0.35 + rng() * 0.25;
    this.verts[crevIdx].r *= crevDepth;
    const crevVert = this.verts[crevIdx];
    this.crevice = {
      cx: x + Math.cos(crevVert.a) * crevVert.r * 1.6,
      cy: y + Math.sin(crevVert.a) * crevVert.r * 1.6,
    };
    this.hue = 200 + rng() * 40;
    this.light = 18 + rng() * 14;
    // Build convex hull radius for quick collision
    this.maxR = this.verts.reduce((m, v) => Math.max(m, v.r), 0) + 4;
    // Gentle-to-moderate ambient motion
    this.vx = (rng() - 0.5) * 2.2;
    this.vy = (rng() - 0.5) * 2.2;
    this.angle = rng() * TAU;
    this.spin = (rng() - 0.5) * 0.55;
    this.driftPhase = rng() * TAU;
    this.driftAmp = 1.2 + rng() * 2.4;
    this._driftT = rng() * 10;
    // Mass approx for sticking: bigger rocks shove smaller ones less.
    this.mass = this.maxR * this.maxR;
  }

  update(dt, flow = null, hasAttachedPlant = false) {
    this._driftT += dt;
    // Follow water current with drag-limited terminal speed.
    const fx = flow ? flow.x : 0;
    const fy = flow ? flow.y : 0;
    const flowMul = hasAttachedPlant ? 0.14 : 0.36;
    const targetVX = fx * flowMul;
    const targetVY = fy * flowMul;
    const dragK = hasAttachedPlant ? 3.8 : 1.6;
    const blend = 1 - Math.exp(-dragK * dt);
    this.vx += (targetVX - this.vx) * blend;
    this.vy += (targetVY - this.vy) * blend;

    // Slow sinusoidal wander layered over current-following.
    const wanderMul = hasAttachedPlant ? 0.22 : 1;
    const ax = Math.cos(this.driftPhase + this._driftT * 0.27) * this.driftAmp * 0.55 * wanderMul;
    const ay = Math.sin(this.driftPhase * 1.3 + this._driftT * 0.21) * this.driftAmp * 0.55 * wanderMul;
    this.vx += ax * dt;
    this.vy += ay * dt;
    const damp = Math.max(0, 1 - dt * (hasAttachedPlant ? 1.35 : 0.35));
    this.vx *= damp;
    this.vy *= damp;
    const maxV = hasAttachedPlant ? 10 : 28;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > maxV) { this.vx = this.vx / sp * maxV; this.vy = this.vy / sp * maxV; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.spin * dt;
    this.spin *= Math.max(0, 1 - dt * (hasAttachedPlant ? 0.45 : 0.18));
    if (this.crevice) {
      this.crevice.cx += this.vx * dt;
      this.crevice.cy += this.vy * dt;
    }
  }

  // Push an entity out of the rock if overlapping
  pushOut(e) {
    for (let pass = 0; pass < 2; pass++) {
      const dx = e.x - this.x, dy = e.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > this.maxR + e.r + 2) return; // quick reject
      // Find the polygon edge approx via radial test
      const angle = Math.atan2(dy, dx);
      const rockR = this._effectiveRadiusForCircle(angle, d, Math.max(0.6, e.r * 0.72));
      const overlap = rockR + e.r * 0.9 - d;
      if (overlap <= 0) return;

      const nx = d > 0.001 ? (dx / d) : Math.cos(angle);
      const ny = d > 0.001 ? (dy / d) : Math.sin(angle);
      const target = rockR + e.r * 0.92 + 0.45;
      e.x = this.x + nx * target;
      e.y = this.y + ny * target;

      // Remove inward velocity component so entities slide along rock surfaces.
      const vn = e.vx * nx + e.vy * ny;
      if (vn < 0) {
        e.vx -= vn * nx;
        e.vy -= vn * ny;
      }
      e.vx *= 0.93;
      e.vy *= 0.93;
    }
  }

  _effectiveRadiusForCircle(angle, distFromCenter, circleR) {
    const base = this._radiusAt(angle);
    if (circleR <= 0.01 || distFromCenter <= 0.01) return base;
    const spread = Math.asin(Math.min(0.85, circleR / Math.max(circleR + 4, distFromCenter))) * 0.72;
    let best = base;
    const samples = [-0.75, -0.3, 0.3, 0.75];
    for (let i = 0; i < samples.length; i++) {
      const rr = this._radiusAt(angle + spread * samples[i]);
      if (rr > best) best = rr;
    }
    return best;
  }

  _radiusAt(angle) {
    // Interpolate between adjacent vertices by normalized angle.
    const aNorm = ((angle % TAU) + TAU) % TAU;
    const n = this.verts.length;
    for (let i = 0; i < n; i++) {
      const a0 = this.verts[i].a;
      const next = this.verts[(i + 1) % n];
      const a1 = i === n - 1 ? next.a + TAU : next.a;
      const a = aNorm < a0 ? aNorm + TAU : aNorm;
      if (a >= a0 && a <= a1) {
        const span = Math.max(0.0001, a1 - a0);
        const t = (a - a0) / span;
        return lerp(this.verts[i].r, this.verts[(i + 1) % n].r, t);
      }
    }
    return this.r;
  }

  draw(ctx, camX, camY, w, h) {
    const sx = this.x - camX + w * 0.5;
    const sy = this.y - camY + h * 0.5;
    const g = window.GAME;
    if (g) {
      const rr = g.getRenderRadius() + this.maxR + 220;
      if (dist2(this.x, this.y, g.camX, g.camY) > rr * rr) return;
    }

    ctx.save();
    ctx.translate(sx, sy);

    // Soft top-down drop shadow
    ctx.fillStyle = 'rgba(18,8,28,0.34)';
    ctx.beginPath();
    ctx.ellipse(this.r * 0.12, this.r * 0.32, this.r * 1.05, this.r * 0.42, 0, 0, TAU);
    ctx.fill();

    // Silhouette path
    ctx.beginPath();
    for (let i = 0; i < this.verts.length; i++) {
      const v = this.verts[i];
      const x = Math.cos(v.a) * v.r, y = Math.sin(v.a) * v.r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Thick ink outline
    ctx.strokeStyle = '#1a1024';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5, this.r * 0.11);
    ctx.stroke();

    // Flat color fill
    ctx.fillStyle = hslaCSS(this.hue, 24, Math.min(60, this.light + 22), 1);
    ctx.fill();

    // Lit cap (inside clipped silhouette)
    ctx.save();
    ctx.clip();
    ctx.fillStyle = hslaCSS(this.hue + 6, 22, Math.min(85, this.light + 42), 0.65);
    ctx.beginPath();
    ctx.ellipse(-this.r * 0.3, -this.r * 0.4, this.r * 1.0, this.r * 0.55, -0.4, 0, TAU);
    ctx.fill();
    // Tiny moss/highlight specks
    ctx.fillStyle = hslaCSS(this.hue + 80, 50, 80, 0.55);
    for (let i = 0; i < 3; i++) {
      const a = i * 1.7 + (this.hue * 0.01);
      const rr = this.r * 0.55;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr * 0.6, Math.sin(a) * rr * 0.6, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EGG — mating result, hatches into player
// ─────────────────────────────────────────────────────────────────────────────
class Egg {
  constructor(x, y, hue) {
    this.x = x; this.y = y;
    this.hue = hue;
    this.t = 0;
    this.done = false;
    this.cracks = [];
    // generate crack lines that grow in over time
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU;
      this.cracks.push({ a, len: 0.1 + Math.random() * 0.35, grow: 0.3 + Math.random() * 0.4 });
    }
  }

  update(dt) { this.t += dt; }

  draw(ctx, camX, camY, w, h) {
    const sx = this.x - camX + w * 0.5;
    const sy = this.y - camY + h * 0.5;
    const prog = Math.min(1, this.t / T.EGG_HATCH_TIME);
    const pulse = 1 + 0.08 * Math.sin(this.t * 6);
    const r = 12 * pulse;

    // glow
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.5);
    grad.addColorStop(0, hslaCSS(this.hue, 80, 75, 0.4 * (1 - prog * 0.5)));
    grad.addColorStop(1, hslaCSS(this.hue, 80, 60, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, r * 3.5, 0, TAU); ctx.fill();

    // egg body
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = hslaCSS(this.hue, 55, 72, 0.92);
    ctx.strokeStyle = hslaCSS(this.hue, 60, 85, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.1, r * 0.72, r, 0, 0, TAU);
    ctx.fill(); ctx.stroke();

    // cracks (appear as prog > 0.4)
    if (prog > 0.4) {
      const crackA = (prog - 0.4) / 0.6;
      ctx.strokeStyle = hslaCSS(this.hue - 20, 40, 30, 0.7 * crackA);
      ctx.lineWidth = 1;
      for (const c of this.cracks) {
        const len = r * c.len * crackA;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(c.a) * len, Math.sin(c.a) * len);
        ctx.stroke();
      }
    }

    // burst flash near end
    if (prog > 0.85) {
      const flash = (prog - 0.85) / 0.15;
      ctx.fillStyle = hslaCSS(this.hue, 90, 90, 0.35 * flash);
      ctx.beginPath(); ctx.arc(0, 0, r * 2.5 * flash, 0, TAU); ctx.fill();
    }

    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HAZARDS
// ─────────────────────────────────────────────────────────────────────────────
class Hazard extends Entity {
  constructor(x, y, type) {
    super(x, y);
    this.kind = 'hazard';
    this.type = type;
    this.r = type === 'vent' ? 110
      : type === 'toxic' ? 140
      : type === 'spine_weed' ? 130
      : type === 'curl_weed' ? 120
      : 160;
    this.t = Math.random() * TAU;
    this.life = 0;
    this.maxLife = (type === 'spine_weed' || type === 'curl_weed') ? (120 + Math.random() * 90) : (30 + Math.random() * 30);
    this.dead = false;
    this.leaves = [];
    if (type === 'spine_weed') {
      const count = 16 + ((Math.random() * 4) | 0);
      for (let i = 0; i < count; i++) {
        this.leaves.push({
          base: (i / count) * TAU + (Math.random() - 0.5) * 0.24,
          len: this.r * (0.45 + Math.random() * 0.45),
          bend: 0,
          twigCount: 1 + ((Math.random() * 3) | 0),
          twigBias: (Math.random() - 0.5) * 0.5,
          droop: (Math.random() - 0.5) * 0.28,
          curlJitter: 0.05 + Math.random() * 0.18,
          leafLobe: 0.75 + Math.random() * 0.6,
          twigSpread: 0.58 + Math.random() * 0.14,
        });
      }
    } else if (type === 'curl_weed') {
      const count = 12 + ((Math.random() * 4) | 0);
      for (let i = 0; i < count; i++) {
        this.leaves.push({
          base: (i / count) * TAU + (Math.random() - 0.5) * 0.35,
          len: this.r * (0.5 + Math.random() * 0.35),
          curl: 0.7 + Math.random() * 0.85,
          twigCount: 2 + ((Math.random() * 2) | 0),
          droop: (Math.random() - 0.5) * 0.36,
          curlJitter: 0.08 + Math.random() * 0.24,
          leafLobe: 0.85 + Math.random() * 0.8,
          twigSpread: 0.58 + Math.random() * 0.14,
        });
      }
    }
  }
  update(dt) {
    this.life += dt;
    if (this.life > this.maxLife) this.dead = true;
    this.t += dt;
    if (this.type === 'spine_weed') {
      for (const lf of this.leaves) lf.bend *= Math.max(0, 1 - dt * 2.8);
    }
  }
  affect(target, dt, game) {
    const d = Math.hypot(target.x - this.x, target.y - this.y);
    const influenceR = (this.type === 'spine_weed' || this.type === 'curl_weed') ? this.r * 1.08 : this.r;
    if (d > influenceR) return;
    const k = 1 - d / influenceR;
    if (this.type === 'toxic') {
      target.takeDamage(6 * dt * k, 'Toxic bloom', game);
    } else if (this.type === 'vent') {
      const burst = Math.sin(this.t * 1.4) > 0.6;
      if (burst) target.takeDamage(14 * dt * k, 'Thermal vent', game);
    } else if (this.type === 'current') {
      target.vx += Math.cos(this.t * 0.2) * 120 * dt * k;
      target.vy += Math.sin(this.t * 0.2) * 120 * dt * k;
    } else if (this.type === 'spine_weed') {
      const relA = Math.atan2(target.y - this.y, target.x - this.x);
      let touched = 0;
      for (const lf of this.leaves) {
        const la = lf.base + lf.bend;
        const spread = 0.18 + target.r / Math.max(24, this.r) * 0.2;
        const ad = Math.abs(angDelta(la, relA));
        if (ad < spread) {
          touched++;
          const side = angDelta(relA, la) >= 0 ? 1 : -1;
          lf.bend += side * 0.11 * k;
        }
      }
      const stackSlow = clamp(0.2 + touched * 0.16 * k, 0.2, 0.94);
      const drag = Math.max(0.08, 1 - stackSlow * dt * 13.2);
      target.vx *= drag;
      target.vy *= drag;
      const sink = clamp((0.28 + touched * 0.12) * k, 0.12, 0.62);
      target.vx -= (target.x - this.x) * sink * dt * 0.25;
      target.vy -= (target.y - this.y) * sink * dt * 0.25;
    } else if (this.type === 'curl_weed') {
      const staticSlow = clamp(0.64 * k, 0.12, 0.64);
      const drag = Math.max(0.32, 1 - staticSlow * dt * 9.2);
      target.vx *= drag;
      target.vy *= drag;
      target.vx -= (target.x - this.x) * k * dt * 0.08;
      target.vy -= (target.y - this.y) * k * dt * 0.08;
    } else if (this.type === 'deadzone') {
      if (target === game.player) target.energy -= 6 * dt * k;
    }
  }
  draw(ctx, camX, camY, w, h, game) {
    const sx = this.x - camX + w * 0.5;
    const sy = this.y - camY + h * 0.5;
    if (sx < -this.r * 2 || sy < -this.r * 2 || sx > w + this.r * 2 || sy > h + this.r * 2) return;

    let hue, sat, light;
    if (this.type === 'toxic')    { hue = 110; sat = 70; light = 35; }
    else if (this.type === 'vent') { hue = 20;  sat = 90; light = 55; }
    else if (this.type === 'current') { hue = 195; sat = 40; light = 60; }
    else if (this.type === 'spine_weed') { hue = 118; sat = 52; light = 35; }
    else if (this.type === 'curl_weed') { hue = 142; sat = 48; light = 38; }
    else { hue = 240; sat = 40; light = 20; }

    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, this.r);
    if (this.type === 'vent') {
      const pulse = Math.sin(this.t * 1.4);
      grad.addColorStop(0, hslaCSS(hue, sat, light + pulse * 10, 0.55));
      grad.addColorStop(0.5, hslaCSS(hue + 20, sat - 10, light - 10, 0.2));
      grad.addColorStop(1, hslaCSS(hue, sat, light - 25, 0));
    } else {
      grad.addColorStop(0, hslaCSS(hue, sat, light, 0.35));
      grad.addColorStop(1, hslaCSS(hue, sat, light - 10, 0));
    }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, this.r, 0, TAU); ctx.fill();

    if (this.type === 'vent') {
      for (let i = 0; i < 3; i++) {
        const a = this.t + i * 2;
        ctx.fillStyle = hslaCSS(20, 90, 70, 0.18);
        ctx.beginPath();
        ctx.arc(sx + Math.cos(a) * 20, sy + Math.sin(a) * 20, this.r * (0.45 + i * 0.18), 0, TAU);
        ctx.fill();
      }
    } else if (this.type === 'spine_weed') {
      ctx.strokeStyle = hslaCSS(130, 62, 64, 0.82);
      ctx.lineWidth = 1.6;
      for (const lf of this.leaves) {
        const a = lf.base + lf.bend + lf.droop * 0.35;
        const cA = a + Math.sin(this.t * 0.9 + lf.base * 4.4) * lf.curlJitter;
        const xm = sx + Math.cos(cA) * lf.len * 0.52;
        const ym = sy + Math.sin(cA) * lf.len * 0.52;
        const x2 = sx + Math.cos(a) * lf.len;
        const y2 = sy + Math.sin(a) * lf.len;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(xm, ym, x2, y2);
        ctx.stroke();

        for (let ti = 0; ti < lf.twigCount; ti++) {
          const t = 0.3 + (ti + 1) / (lf.twigCount + 1) * 0.62;
          const bx = sx + Math.cos(a) * lf.len * t;
          const by = sy + Math.sin(a) * lf.len * t;
          const nA = a + HALF_PI + (ti % 2 ? -1 : 1) * (0.08 + lf.twigBias * 0.35 + lf.droop * 0.3);
          const twigLen = lf.len * (0.1 + 0.06 * ti);
          const tx = bx + Math.cos(nA) * twigLen;
          const ty = by + Math.sin(nA) * twigLen;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(tx, ty);
          ctx.stroke();

          if (ti === lf.twigCount - 1) {
            const lobeR = Math.max(1.2, twigLen * 0.11 * lf.leafLobe);
            ctx.fillStyle = hslaCSS(132, 64, 64, 0.45);
            ctx.beginPath();
            ctx.arc(tx, ty, lobeR, 0, TAU);
            ctx.fill();
          }
        }
      }
      ctx.fillStyle = hslaCSS(142, 68, 62, 0.72);
      ctx.beginPath();
      ctx.arc(sx, sy, this.r * 0.11, 0, TAU);
      ctx.fill();
    } else if (this.type === 'curl_weed') {
      ctx.strokeStyle = hslaCSS(148, 52, 62, 0.78);
      ctx.lineWidth = 1.7;
      for (const lf of this.leaves) {
        const a = lf.base + lf.droop * 0.4 + Math.sin(this.t * 0.8 + lf.base * 3) * lf.curlJitter;
        const len = lf.len;
        const x1 = sx + Math.cos(a) * len * 0.35;
        const y1 = sy + Math.sin(a) * len * 0.35;
        const x2 = sx + Math.cos(a + lf.curl * 0.35) * len;
        const y2 = sy + Math.sin(a + lf.curl * 0.35) * len;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(x1, y1, x2, y2);
        ctx.stroke();

        for (let ti = 0; ti < lf.twigCount; ti++) {
          const t = 0.32 + (ti + 1) / (lf.twigCount + 1) * 0.5;
          const bx = sx + Math.cos(a + lf.curl * 0.18) * len * t;
          const by = sy + Math.sin(a + lf.curl * 0.18) * len * t;
          const side = ti % 2 ? -1 : 1;
          const twigA = a + lf.curl * 0.45 + side * (HALF_PI * lf.twigSpread);
          const twigLen = len * (0.08 + 0.04 * ti);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(twigA) * twigLen, by + Math.sin(twigA) * twigLen);
          ctx.stroke();

          if ((ti & 1) === 0) {
            const lx = bx + Math.cos(twigA) * twigLen;
            const ly = by + Math.sin(twigA) * twigLen;
            ctx.fillStyle = hslaCSS(146, 56, 66, 0.34);
            ctx.beginPath();
            ctx.ellipse(lx, ly, Math.max(1.2, twigLen * 0.15), Math.max(0.9, twigLen * 0.08), twigA, 0, TAU);
            ctx.fill();
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ECOSYSTEM DIRECTOR — tracks state, controls spawning & events
// ─────────────────────────────────────────────────────────────────────────────
class Director {
  constructor(game, rng) {
    this.game = game;
    this.rng = rng;
    this.killsBySpecies = {};
    this.totalKills = 0;
    this.aggression = 0;
    this.spawnT = 0;
    this.foodT = 0;
    this.hazardT = 55 + rng() * 30; // first hazard plants appear after ~55–85s
    this.plantT = 3.5 + rng() * 4.5;
    this.eventT = 35 + rng() * 25;
    this.currentEvent = null;
    this.eventDur = 0;
    this.lastBiomeId = null;
    this.legendaryT = 90 + rng() * 60;
    this.apexPressureT = 24 + rng() * 16;
    this.legendariesSeen = new Set();
    this.eventsSeen = new Set();
  }

  registerKill(creature) {
    const id = creature.templateId;
    this.killsBySpecies[id] = (this.killsBySpecies[id] || 0) + 1;
    this.totalKills++;
    this.aggression = Math.min(2.5, this.aggression + 0.05 + (creature.r > 14 ? 0.1 : 0));
    this.aggression *= 0.999;
  }

  speciesPressure(templateId) {
    return Math.min(1, (this.killsBySpecies[templateId] || 0) / 12);
  }

  update(dt, player) {
    // baseline aggression decay
    this.aggression = Math.max(0, this.aggression - dt * 0.005);

    // event timing
    this.eventT -= dt;
    if (this.currentEvent) {
      this.eventDur -= dt;
      if (this.eventDur <= 0) {
        this.endEvent();
      }
    } else if (this.eventT <= 0) {
      this.triggerRandomEvent(player);
      this.eventT = 45 + this.rng() * 35;
    }

    // legendary
    this.legendaryT -= dt;
    if (this.legendaryT <= 0 && player.totalTime > 60 && this.game.creatures.length < T.CREATURE_CAP) {
      this.spawnLegendary(player);
      this.legendaryT = 140 + this.rng() * 90;
    }

    // creature spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.game.creatures.filter(c => !c.dead).length < T.CREATURE_CAP) {
      const localCreatureR = this.game.getActiveRadius() * 1.4;
      const localCreatureR2 = localCreatureR * localCreatureR;
      let localCreatureCount = 0;
      let localHerbCount = 0;
      for (let i = 0; i < this.game.creatures.length; i++) {
        const c = this.game.creatures[i];
        if (!c || c.dead) continue;
        if (dist2(c.x, c.y, player.x, player.y) <= localCreatureR2) {
          localCreatureCount++;
          if (c.diet === 'herbivore') localHerbCount++;
        }
      }
      const herbRatio = localCreatureCount > 0 ? (localHerbCount / localCreatureCount) : 0;
      const preferHerb = herbRatio < 0.42;
      this.spawnCreatureNear(player, 3, preferHerb ? 'herbivore' : null);

      // Keep a healthy local population while exploring by topping up if the
      // active neighborhood is sparse.
      if (localCreatureCount < 22 && this.game.creatures.length < T.CREATURE_CAP) {
        this.spawnCreatureNear(player, 2, 'herbivore');
      }

      this.spawnT = 0.42 + this.rng() * 0.38;
    }

    // Ensure there is periodic large predator presence around the player.
    this.apexPressureT -= dt;
    if (this.apexPressureT <= 0 && this.game.creatures.filter(c => !c.dead).length < T.CREATURE_CAP) {
      this.spawnApexNear(player);
      this.apexPressureT = 22 + this.rng() * 16;
    }

    // plant matter — emit drifting plant chunks; they cluster organically into PlantStructure
    this.plantT -= dt;
    if (this.plantT <= 0) {
      const biome = biomeAt(Math.hypot(player.x, player.y));
      if (['bloom', 'current', 'forest', 'shallow', 'vent'].includes(biome.id) &&
          this.game.foods.length < T.FOOD_CAP * 0.75) {
        const count = 4 + Math.floor(this.rng() * 5);
        for (let i = 0; i < count; i++) {
          const a = this.rng() * TAU;
          const minD = Math.max(340, this.game.getSpawnExclusionRadius() + 80);
          const d = minD + this.rng() * 900;
          const f = this.game.spawnFood(
            player.x + Math.cos(a) * d,
            player.y + Math.sin(a) * d,
            'plant', biome, 3 + this.rng() * 1.5
          );
          if (f) { f.vx = (this.rng() - 0.5) * 12; f.vy = (this.rng() - 0.5) * 12; }
        }
      }

      // If nearby plant structures are sparse, seed one directly so exploration
      // reliably encounters node-based plants and not only loose chunks.
      const localPlantR = this.game.getActiveRadius() * 1.5;
      const localPlantR2 = localPlantR * localPlantR;
      let localPlantCount = 0;
      for (let i = 0; i < this.game.plants.length; i++) {
        const pl = this.game.plants[i];
        if (!pl || pl.dead) continue;
        if (dist2(pl.x, pl.y, player.x, player.y) <= localPlantR2) localPlantCount++;
      }
      if (localPlantCount < 8 && this.game.plants.length < T.PLANT_CAP && this.rng() < 0.9) {
        this.spawnPlantStructureNear(player);
      }

      this.plantT = 3.2 + this.rng() * 4.8;
    }

    // hazards
    this.hazardT -= dt;
    if (this.hazardT <= 0 && this.game.hazards.length < T.HAZARD_CAP) {
      this.maybeSpawnHazard(player);
      this.hazardT = 28 + this.rng() * 22;
    }

    // biome transition notice
    const biome = biomeAt(Math.hypot(player.x, player.y));
    if (this.lastBiomeId !== biome.id) {
      this.lastBiomeId = biome.id;
      this.game.ui.showBiome(biome);
      this.game.ui.toast(biome.name);
      this.game.ui.maybeRegenGoals(this.game);
      Audio.event();
    }
  }

  // SPAWNING ───────────────────────────────────────────────────────────────
  spawnFoodNear(player) {
    // Ambient food is disabled: food comes from creature kills and plant matter only.
  }

  spawnCreatureNear(player, minRingAway = 5, preferredDiet = null) {
    const a = this.rng() * TAU;
    const ringSize = RING_SIZE;
    const minD = minRingAway <= 0 ? 260 : Math.max(180, minRingAway * ringSize, this.game.getRenderRadius() + 260);
    const maxD = minRingAway <= 0 ? 1000 : Math.max(minD + 300, T.SPAWN_RADIUS + 900);
    const d = minD + this.rng() * (maxD - minD);
    let x = player.x + Math.cos(a) * d;
    let y = player.y + Math.sin(a) * d;
    const local = biomeAt(Math.hypot(x, y));
    const ring = Math.max(1, Math.floor(Math.hypot(x, y) / RING_SIZE) + 1);
    let pool = local.creatureTemplates.slice();
    if (preferredDiet) {
      const filtered = pool.filter(id => {
        const t = CREATURE_TEMPLATES[id];
        return t && t.diet === preferredDiet;
      });
      if (filtered.length) pool = filtered;
    }
    const ringTier = this.game.getOutwardTierByRing(ring);

    // Director adjusts: if player is dominating, occasionally inject bigger predators
    if (this.aggression > 0.6 && player.r > 15) {
      if (this.rng() < 0.3) pool.push('apex');
      if (this.rng() < 0.4) pool.push('small_hunter');
    }
    // If player overhunts a species, spawn less of it
    let templId = rngPick(this.rng, pool);
    if (this.speciesPressure(templId) > 0.7 && this.rng() < 0.7) {
      templId = rngPick(this.rng, pool);
    }

    // Size class distribution within each ring to keep variety.
    const roll = this.rng();
    const sizeClass = roll < 0.2 ? 'small' : roll < 0.78 ? 'medium' : 'large';
    const candidates = pool
      .map((id) => ({ id, mean: (CREATURE_TEMPLATES[id].sizeRange[0] + CREATURE_TEMPLATES[id].sizeRange[1]) * 0.5 }))
      .sort((a, b) => a.mean - b.mean);
    if (candidates.length > 0) {
      const idx = sizeClass === 'small'
        ? 0
        : sizeClass === 'large'
          ? candidates.length - 1
          : Math.floor(candidates.length * 0.5);
      templId = candidates[clamp(idx, 0, candidates.length - 1)].id;
    }

    if (ringTier >= 2 && sizeClass === 'large' && this.rng() < 0.2) templId = 'apex';
    const templ = CREATURE_TEMPLATES[templId];
    if (!templ) return;

    let count = 1;
    if (templ.swarmy && this.rng() < 0.65) count = 3 + Math.floor(this.rng() * 4);

    for (let i = 0; i < count; i++) {
      const tier = ringTier;
      const outwardScale = this.game.getOutwardScaleByRing(ring);
      const classMul = sizeClass === 'small' ? 0.76 : sizeClass === 'large' ? 1.24 : 1.0;
      const ringPressureScale = 1 + Math.max(0, ring - 1) * 0.018;
      const totalScale = clamp(outwardScale * ringPressureScale * classMul * (0.9 + this.rng() * 0.24), 0.7, 6.2);
      const c = new Creature(
        x + (this.rng() - 0.5) * 80,
        y + (this.rng() - 0.5) * 80,
        templ,
        {
          rng: this.rng,
          swarmId: count > 1 ? (Math.random() * 99999) | 0 : 0,
          hue: 220 + (templ.huesShift || 0) + (local.palette.huePri - 200) * 0.5 + (this.rng() - 0.5) * 50,
          sizeBoost: totalScale,
          hpBoost: Math.pow(outwardScale, 0.92),
          dmgBoost: Math.pow(outwardScale, 0.78),
        }
      );
      c.bornAt = this.rng();
      c.name = genCreatureName(this.rng);
      c.aggression = Math.min(2.0, c.aggression + tier * 0.07);
      const complexityAdds = Math.min(22, Math.floor((ring - 1) / 3) + tier * 2);
      const extraParts = ['frill', 'tendril', 'spike', 'plate', 'eyespot', 'fin'];
      for (let n = 0; n < complexityAdds; n++) {
        const part = rngPick(this.rng, extraParts);
        if (!c.parts.includes(part)) c.parts.push(part);
      }
      const safe = this.game.findSafeSpawnPoint(c.x, c.y, 180, 12, c.r + 10);
      if (!safe) continue;
      if (Math.hypot(safe.x - player.x, safe.y - player.y) < minD) continue;
      c.x = safe.x;
      c.y = safe.y;
      this.game.creatures.push(c);
    }
  }

  spawnLegendary(player) {
    const a = this.rng() * TAU;
    const d = 800 + this.rng() * 600;
    let x = player.x + Math.cos(a) * d;
    let y = player.y + Math.sin(a) * d;
    const safeLegend = this.game.findSafeSpawnPoint(x, y, 220, 12, 18);
    if (!safeLegend) return;
    x = safeLegend.x;
    y = safeLegend.y;
    const base = rngPick(this.rng, LEGENDARY_BASES);
    const templ = CREATURE_TEMPLATES[base.templ];
    const c = new Creature(x, y, templ, {
      rng: this.rng,
      legendary: true,
      sizeBoost: base.sizeBoost,
      hpBoost: 2.5,
      dmgBoost: 1.6,
      hue: base.hueShift,
      unique: base.unique
    });
    c.name = base.name;
    c.bornAt = this.rng();
    c.behavior = templ.behavior;
    c.maxSpeed *= 1.2;
    this.game.creatures.push(c);
    this.legendariesSeen.add(base.name);
    this.game.ui.showEvent('LEGENDARY DETECTED', `Something rare moves nearby — ${base.name}`);
    Audio.event();
  }

  spawnApexNear(player) {
    const nearApex = this.game.creatures.filter(c => !c.dead && c.templateId === 'apex' && dist2(c.x, c.y, player.x, player.y) < (this.game.getActiveRadius() * 1.4) ** 2);
    if (nearApex.length > 0) return;

    const a = this.rng() * TAU;
    const minD = Math.max(this.game.getRenderRadius() + 340, 720);
    const maxD = minD + 800;
    const d = minD + this.rng() * (maxD - minD);
    const x = player.x + Math.cos(a) * d;
    const y = player.y + Math.sin(a) * d;
    const ring = this.game.getRingIndexAt(x, y);
    const outwardScale = this.game.getOutwardScaleByRing(ring);
    const safe = this.game.findSafeSpawnPointWithEscape(x, y, 220, 18, 26, this.game.getSpawnExclusionRadius() * 0.7, 520);
    if (!safe) return;

    const templ = CREATURE_TEMPLATES.apex;
    const c = new Creature(safe.x, safe.y, templ, {
      rng: this.rng,
      hue: 210 + (this.rng() - 0.5) * 30,
      sizeBoost: clamp(outwardScale * (1.02 + this.rng() * 0.24), 1.0, 3.1),
      hpBoost: Math.pow(outwardScale, 0.95),
      dmgBoost: Math.pow(outwardScale, 0.84),
    });
    c.name = genCreatureName(this.rng);
    c.aggression = Math.min(2.2, c.aggression + 0.2 + this.game.getOutwardTierByRing(ring) * 0.04);
    this.game.creatures.push(c);
    this.game.ui.toast('APEX STIRS IN THE DISTANCE');
  }

  spawnPlantStructureNear(player) {
    const a = this.rng() * TAU;
    const minD = Math.max(this.game.getRenderRadius() + 220, 620);
    const maxD = minD + 1000;
    const d = minD + this.rng() * (maxD - minD);
    const tx = player.x + Math.cos(a) * d;
    const ty = player.y + Math.sin(a) * d;
    const safe = this.game.findSafeSpawnPoint(
      tx, ty,
      180,
      12,
      16,
      this.game.getSpawnExclusionRadius() * 0.55
    );
    if (!safe) return;
    if (this.game.plants.length >= T.PLANT_CAP) return;
    const scale = clamp(this.game.getOutwardScaleAt(safe.x, safe.y), 1, 10);
    this.game.plants.push(new PlantStructure(safe.x, safe.y, this.rng, scale));
  }

  maybeSpawnHazard(player) {
    const biome = biomeAt(Math.hypot(player.x, player.y));
    let type;
    if (biome.id === 'vent') type = this.rng() < 0.6 ? 'vent' : 'toxic';
    else if (biome.id === 'abyss') type = this.rng() < 0.5 ? 'deadzone' : 'toxic';
    else if (biome.id === 'forest') type = this.rng() < 0.5 ? 'toxic' : 'current';
    else if (biome.id === 'current') type = 'current';
    else return; // bloom biome no longer spawns plant hazards
    const a = this.rng() * TAU;
    const d = 500 + this.rng() * 700;
    const x = player.x + Math.cos(a) * d;
    const y = player.y + Math.sin(a) * d;
    const safe = this.game.findSafeSpawnPoint(x, y, 120, 10, 20);
    if (!safe) return;
    this.game.hazards.push(new Hazard(safe.x, safe.y, type));
  }

  // EVENTS ─────────────────────────────────────────────────────────────────
  triggerRandomEvent(player) {
    const biome = biomeAt(Math.hypot(player.x, player.y));
    const choices = ['bloom', 'frenzy', 'migration', 'toxic', 'dna_storm'];
    if (biome.id !== 'bloom') choices.push('extinction');
    const id = rngPick(this.rng, choices);

    this.currentEvent = id;
    this.eventDur = 18 + this.rng() * 10;

    let title = '', desc = '';
    switch (id) {
      case 'bloom':
        title = 'Plant Surge';
        desc = 'Nutrients surge — plant matter blooms across the zone.';
        for (let i = 0; i < 24; i++) {
          const a = this.rng() * TAU, d = 180 + this.rng() * 820;
          const px = player.x + Math.cos(a) * d, py = player.y + Math.sin(a) * d;
          if (this.game.foods.length < T.FOOD_CAP) {
            const f = this.game.spawnFood(px, py, 'plant', biomeAt(Math.hypot(px, py)), 3 + this.rng() * 1.5);
            if (f) { f.vx = (this.rng() - 0.5) * 16; f.vy = (this.rng() - 0.5) * 16; }
          }
        }
        break;
      case 'frenzy':
        title = 'Predator Frenzy';
        desc = 'Predator aggression rises sharply.';
        for (const c of this.game.creatures) {
          if (['hunt', 'attack', 'ambush', 'territorial'].includes(c.behavior)) c.angry += 0.8;
        }
        break;
      case 'migration':
        title = 'Mass Migration';
        desc = 'A current pulls creatures through the zone.';
        for (let i = 0; i < 8; i++) this.spawnCreatureNear(player, 5);
        break;
      case 'toxic':
        title = 'Toxic Bloom';
        desc = 'Poisonous clouds drift through the water.';
        for (let i = 0; i < 3; i++) {
          const a = this.rng() * TAU, d = 400 + this.rng() * 600;
          this.game.hazards.push(new Hazard(player.x + Math.cos(a) * d, player.y + Math.sin(a) * d, 'toxic'));
        }
        break;
      case 'dna_storm':
        title = 'Hunt Wave';
        desc = 'Predator packs surge through the zone.';
        for (let i = 0; i < 7; i++) this.spawnCreatureNear(player, 5);
        break;
      case 'extinction':
        title = 'Extinction Pulse';
        desc = 'The current grows hostile. Few will survive.';
        for (const c of this.game.creatures) {
          if (this.rng() < 0.25) c.takeDamage(c.maxHP, 'extinction', this.game);
        }
        break;
    }
    this.eventsSeen.add(id);
    this.game.ui.showEvent(title.toUpperCase(), desc);
    Audio.event();
  }

  endEvent() {
    this.currentEvent = null;
    this.game.ui.hideEvent();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS — dynamic
// ─────────────────────────────────────────────────────────────────────────────
const GOAL_DEFS = [
  {
    id: 'eat_basic', text: 'Consume 8 food chunks', target: 8,
    progress: (p) => Math.min(8, p.eaten),
    check: (p) => p.eaten >= 8,
    weight: 3, biomes: ['bloom', 'current']
  },
  {
    id: 'survive_short', text: 'Survive for 90 seconds', target: 90,
    progress: (p) => Math.min(90, p.totalTime),
    check: (p) => p.totalTime >= 90,
    weight: 2, biomes: ['bloom', 'current', 'forest', 'vent', 'abyss']
  },
  {
    id: 'unlock_mutation', text: 'Unlock 1 mutation', target: 1,
    progress: (p) => Math.min(1, p.mutations.length),
    check: (p) => p.mutations.length >= 1,
    weight: 3, biomes: ['bloom']
  },
  {
    id: 'unlock_mutations_3', text: 'Unlock 3 mutations', target: 3,
    progress: (p) => Math.min(3, p.mutations.length),
    check: (p) => p.mutations.length >= 3,
    weight: 2, biomes: ['current', 'forest']
  },
  {
    id: 'reach_current', text: 'Enter Competitive Current', target: 1,
    progress: (p) => p.deepestRadius > BIOME_CURRENT_INNER ? 1 : 0,
    check: (p) => p.deepestRadius > BIOME_CURRENT_INNER,
    weight: 3, biomes: ['bloom']
  },
  {
    id: 'reach_forest', text: 'Enter Bacterial Forest', target: 1,
    progress: (p) => p.deepestRadius > BIOME_FOREST_INNER ? 1 : 0,
    check: (p) => p.deepestRadius > BIOME_FOREST_INNER,
    weight: 3, biomes: ['current']
  },
  {
    id: 'reach_vent', text: 'Enter Thermal Vent Field', target: 1,
    progress: (p) => p.deepestRadius > BIOME_VENT_INNER ? 1 : 0,
    check: (p) => p.deepestRadius > BIOME_VENT_INNER,
    weight: 3, biomes: ['forest']
  },
  {
    id: 'reach_abyss', text: 'Descend into Abyssal Dark', target: 1,
    progress: (p) => p.deepestRadius > BIOME_ABYSS_INNER ? 1 : 0,
    check: (p) => p.deepestRadius > BIOME_ABYSS_INNER,
    weight: 3, biomes: ['vent']
  },
  {
    id: 'kills', text: 'Defeat 5 hostile organisms', target: 5,
    progress: (p) => Math.min(5, p.kills),
    check: (p) => p.kills >= 5,
    weight: 2, biomes: ['current', 'forest']
  },
  {
    id: 'big', text: 'Reach size 25', target: 25,
    progress: (p) => Math.min(25, Math.floor(p.r)),
    check: (p) => p.r >= 25,
    weight: 2, biomes: ['forest', 'vent']
  },
  {
    id: 'apex', text: 'Reach size 40 (apex tier)', target: 40,
    progress: (p) => Math.min(40, Math.floor(p.r)),
    check: (p) => p.r >= 40,
    weight: 3, biomes: ['vent', 'abyss']
  },
  {
    id: 'legendary', text: 'Encounter a legendary creature', target: 1,
    progress: (p, g) => g.director.legendariesSeen.size > 0 ? 1 : 0,
    check: (p, g) => g.director.legendariesSeen.size > 0,
    weight: 2, biomes: ['vent', 'abyss']
  },
];

class GoalSet {
  constructor(rng, biome) {
    this.list = [];
    this.regen(rng, biome);
  }
  regen(rng, biome) {
    const pool = GOAL_DEFS.filter(g => g.biomes.includes(biome.id));
    const taken = new Set();
    const out = [];
    const target = Math.min(3, pool.length);
    const sortable = pool.slice();
    while (out.length < target && sortable.length > 0) {
      const i = Math.floor(rng() * sortable.length);
      const g = sortable.splice(i, 1)[0];
      if (!taken.has(g.id)) { taken.add(g.id); out.push(Object.assign({}, g, { done: false })); }
    }
    this.list = out;
  }
  update(player, game) {
    for (const g of this.list) {
      if (!g.done && g.check(player, game)) {
        g.done = true;
        player.mutationUnlockTokens += 1;
        player.dna += 2;
        game.ui.toast('GOAL · ' + g.text);
        Audio.mutation();
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI controller
// ─────────────────────────────────────────────────────────────────────────────
class UI {
  constructor() {
    this.el = {
      barHp: document.getElementById('bar-health'),
      barEn: document.getElementById('bar-energy'),
      barSize: document.getElementById('bar-size'),
      valHp: document.getElementById('val-health'),
      valEn: document.getElementById('val-energy'),
      valSize: document.getElementById('val-size'),
      biomeName: document.getElementById('biome-name'),
      biomeTier: document.getElementById('biome-tier'),
      goalList: document.getElementById('goal-list'),
      warn: document.getElementById('hud-warn'),
      event: document.getElementById('hud-event'),
      eventTitle: document.getElementById('event-title'),
      eventDesc: document.getElementById('event-desc'),
      time: document.getElementById('meta-time'),
      seed: document.getElementById('meta-seed'),
      codexPanel: document.getElementById('hud-codex'),
      codexToggle: document.getElementById('codex-toggle'),
      codexBody: document.getElementById('codex-body'),
      codexCount: document.getElementById('codex-count'),
      codexRecent: document.getElementById('codex-recent'),
      codexList: document.getElementById('codex-list'),
      toast: document.getElementById('toast'),
      mutOverlay: document.getElementById('mutation-overlay'),
      mutGrid: document.getElementById('mutation-grid'),
      mutPrompt: document.getElementById('mutation-prompt'),
      pauseOverlay: document.getElementById('pause-overlay'),
      pauseSettingsBtn: document.getElementById('pause-settings-btn'),
      pauseQuitMenuBtn: document.getElementById('pause-quit-menu-btn'),
      pauseQuitDesktopBtn: document.getElementById('pause-quit-desktop-btn'),
      pauseSettingsPanel: document.getElementById('pause-settings-panel'),
      pauseAudioBtn: document.getElementById('pause-audio-btn'),
      pauseResetZoomBtn: document.getElementById('pause-reset-zoom-btn'),
      pauseSettingsCloseBtn: document.getElementById('pause-settings-close-btn'),
      pauseControlsBtn: document.getElementById('pause-controls-btn'),
      controlsRebindPanel: document.getElementById('controls-rebind-panel'),
      controlsResetBtn: document.getElementById('controls-reset-btn'),
      devTools: document.getElementById('dev-tools'),
      devCloseBtn: document.getElementById('dev-close-btn'),
      devSoftStatus: document.getElementById('dev-soft-status'),
      devSoftToggleBtn: document.getElementById('dev-soft-toggle-btn'),
      devSoftRespawnBtn: document.getElementById('dev-soft-respawn-btn'),
      devOpenLabBtn: document.getElementById('dev-open-lab-btn'),
      gameOver: document.getElementById('game-over'),
      deathCause: document.getElementById('death-cause'),
      summary: document.getElementById('summary-grid'),
      intro: document.getElementById('intro'),
      seedInput: document.getElementById('seed-input'),
      startBtn: document.getElementById('start-btn'),
      restartBtn: document.getElementById('restart-btn'),
      resumeBtn: document.getElementById('resume-btn'),
      audioBtn: document.getElementById('audio-toggle'),
    };
    this.codexExpanded = false;
    if (this.el.codexToggle && this.el.codexPanel) {
      this.el.codexToggle.addEventListener('click', () => {
        this.codexExpanded = !this.codexExpanded;
        this.el.codexPanel.classList.toggle('collapsed', !this.codexExpanded);
        this.el.codexToggle.textContent = this.codexExpanded ? 'Hide' : 'Show';
      });
      this.el.codexPanel.classList.add('collapsed');
      this.el.codexToggle.textContent = 'Show';
    }
    this._toastT = 0;
    this._eventT = 0;
    this._goalRegenT = 0;
    this._lastBiomeId = null;
  }

  setStats(p) {
    const hpPct = clamp(p.hp / p.stats.hpMax, 0, 1) * 100;
    const enPct = clamp(p.energy / p.stats.energyMax, 0, 1) * 100;
    const szPct = clamp((p.r - T.PLAYER_START_SIZE) / (T.PLAYER_MAX_SIZE - T.PLAYER_START_SIZE), 0, 1) * 100;
    this.el.barHp.style.width = hpPct + '%';
    this.el.barEn.style.width = enPct + '%';
    this.el.barSize.style.width = szPct + '%';
    this.el.valHp.textContent = Math.ceil(p.hp);
    this.el.valEn.textContent = Math.ceil(p.energy);
    this.el.valSize.textContent = (p.r).toFixed(1);
  }

  setTime(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    this.el.time.textContent = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  setSeed(s) { this.el.seed.textContent = s; }

  setCodex(parts, recent = '') {
    if (!this.el.codexCount || !this.el.codexRecent) return;
    const count = parts ? parts.size : 0;
    this.el.codexCount.textContent = `${count} part${count === 1 ? '' : 's'} discovered`;
    const fullList = parts ? Array.from(parts) : [];
    if (this.el.codexList) this.el.codexList.textContent = fullList.length > 0 ? fullList.join(' · ') : 'No discoveries yet.';
    if (recent) {
      this.el.codexRecent.textContent = recent;
      return;
    }
    const list = parts ? Array.from(parts).slice(-4) : [];
    this.el.codexRecent.textContent = list.length > 0 ? list.join(' · ') : 'No discoveries yet.';
  }

  showBiome(biome) {
    this.el.biomeName.textContent = biome.name.toUpperCase();
    this.el.biomeTier.textContent = 'TIER ' + biome.tier;
  }

  setWarn(on) {
    this.el.warn.classList.toggle('show', on);
  }

  showEvent(title, desc) {
    this.el.eventTitle.textContent = title;
    this.el.eventDesc.textContent = desc;
    this.el.event.classList.add('show');
    this._eventT = 6;
  }
  hideEvent() { this.el.event.classList.remove('show'); this._eventT = 0; }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this._toastT = 2.4;
  }

  updateOverlays(dt) {
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.el.toast.classList.remove('show');
    }
    if (this._eventT > 0) {
      this._eventT -= dt;
      if (this._eventT <= 0) this.el.event.classList.remove('show');
    }
  }

  setGoals(goals) {
    this.el.goalList.innerHTML = '';
    for (const g of goals.list) {
      const div = document.createElement('div');
      div.className = 'goal-item' + (g.done ? ' done' : '');
      const t = document.createElement('div');
      t.className = 'goal-text';
      t.textContent = (g.done ? '✓ ' : '• ') + g.text;
      div.appendChild(t);
      if (!g.done && g.target > 1) {
        const bar = document.createElement('div');
        bar.className = 'goal-bar-track';
        const fill = document.createElement('div');
        fill.className = 'goal-bar-fill';
        fill.style.width = '0%';
        bar.appendChild(fill);
        div.appendChild(bar);
      }
      this.el.goalList.appendChild(div);
    }
  }

  updateGoalProgress(goals, player, game) {
    const children = this.el.goalList.children;
    for (let i = 0; i < goals.list.length && i < children.length; i++) {
      const g = goals.list[i];
      const child = children[i];
      if (g.done) {
        if (!child.classList.contains('done')) {
          child.classList.add('done');
          child.firstChild.textContent = '✓ ' + g.text;
        }
        continue;
      }
      if (g.target > 1) {
        const bar = child.querySelector('.goal-bar-fill');
        if (bar) bar.style.width = Math.min(100, (g.progress(player, game) / g.target) * 100) + '%';
      }
    }
  }

  maybeRegenGoals(game) {
    if (this._lastBiomeId === game.lastBiomeId) return;
    this._lastBiomeId = game.lastBiomeId;
    game.goals.regen(game.rng, biomeAt(Math.hypot(game.player.x, game.player.y)));
    this.setGoals(game.goals);
  }

  showMutationChoice(choices, onPick) {
    this.el.mutGrid.innerHTML = '';
    for (const m of choices) {
      const card = document.createElement('div');
      card.className = 'mutation-card';
      card.innerHTML = `
        <div class="mutation-icon">${mutationIconSVG(m.icon)}</div>
        <div class="mutation-name">${m.name}</div>
        <div class="mutation-benefit">${m.benefit}</div>
        <div class="mutation-cost">${m.cost}</div>
        <div class="mutation-flavor">${m.flavor}</div>
      `;
      card.addEventListener('click', () => {
        this.el.mutOverlay.classList.remove('show');
        onPick(m);
      });
      this.el.mutGrid.appendChild(card);
    }
    this.el.mutOverlay.classList.add('show');
  }

  showGameOver(player, director, seedString, runtime) {
    this.el.deathCause.textContent = (player.deathCause || 'Consumed').toUpperCase();
    const speciesEntries = Object.entries(director.killsBySpecies);
    speciesEntries.sort((a,b) => b[1] - a[1]);
    const topSpecies = speciesEntries.length ? speciesEntries.slice(0, 2).map(([k,v]) => `${k}×${v}`).join(', ') : '—';
    this.el.summary.innerHTML = `
      <div class="label">Survived</div><div class="value">${fmtTime(runtime)}</div>
      <div class="label">Size reached</div><div class="value">${player.maxSizeReached.toFixed(1)}</div>
      <div class="label">Mutations</div><div class="value">${player.mutations.length}</div>
      <div class="label">Kills</div><div class="value">${player.kills}</div>
      <div class="label">Eaten</div><div class="value">${player.eaten}</div>
      <div class="label">Top hunted</div><div class="value">${topSpecies}</div>
      <div class="label">Deepest</div><div class="value">${Math.floor(player.deepestRadius)} u</div>
      <div class="label">Legendaries</div><div class="value">${director.legendariesSeen.size}</div>
      <div class="label">Seed</div><div class="value">${seedString}</div>
    `;
    this.el.gameOver.classList.add('show');
  }
  hideGameOver() { this.el.gameOver.classList.remove('show'); }

  showPause(on) { this.el.pauseOverlay.classList.toggle('show', on); }

  showDevTools(on) {
    if (this.el.devTools) this.el.devTools.classList.toggle('show', on);
  }

  showPauseSettings(on) {
    if (!this.el.pauseSettingsPanel) return;
    this.el.pauseSettingsPanel.style.display = on ? 'block' : 'none';
  }

  setSoftCreatureStatus(enabled, count) {
    if (this.el.devSoftStatus) this.el.devSoftStatus.textContent = enabled ? `On · ${count}` : 'Off';
    if (this.el.devSoftToggleBtn) this.el.devSoftToggleBtn.textContent = enabled ? 'Disable Soft Creatures' : 'Enable Soft Creatures';
  }

  setAudioLabel(isOn) {
    const txt = isOn ? 'Audio: On' : 'Audio: Off';
    if (this.el.pauseAudioBtn) this.el.pauseAudioBtn.textContent = txt;
    if (this.el.audioBtn) this.el.audioBtn.textContent = isOn ? 'audio: on' : 'audio: off';
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function mutationIconSVG(kind) {
  // Tiny inline SVG icons
  const stroke = '#a8e2ff';
  const fill = 'none';
  const W = 60, H = 60;
  const wrap = (inner) => `<svg width="${W}" height="${H}" viewBox="0 0 60 60" stroke="${stroke}" fill="${fill}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  switch (kind) {
    case 'spikes': return wrap(`<circle cx="30" cy="30" r="14"/><g>${[0,1,2,3,4,5,6,7].map(i => { const a = i/8 * Math.PI*2; const x1 = 30+Math.cos(a)*14, y1 = 30+Math.sin(a)*14; const x2 = 30+Math.cos(a)*24, y2 = 30+Math.sin(a)*24; return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join('')}</g>`);
    case 'plates': return wrap(`<circle cx="30" cy="30" r="14"/><circle cx="30" cy="30" r="20"/><path d="M16 30 Q30 18 44 30"/>`);
    case 'eyes':   return wrap(`<circle cx="30" cy="30" r="14"/><circle cx="22" cy="24" r="3" fill="${stroke}"/><circle cx="36" cy="22" r="3" fill="${stroke}"/><circle cx="38" cy="34" r="2" fill="${stroke}"/>`);
    case 'glow':   return wrap(`<circle cx="30" cy="30" r="8" fill="${stroke}" stroke="none" opacity="0.55"/><circle cx="30" cy="30" r="14"/><circle cx="30" cy="30" r="22" opacity="0.4"/>`);
    case 'jet':    return wrap(`<circle cx="34" cy="30" r="11"/><path d="M22 30 L10 24 M22 30 L10 30 M22 30 L10 36"/>`);
    case 'venom':  return wrap(`<circle cx="30" cy="30" r="14"/><path d="M30 18 Q34 23 30 28 Q26 23 30 18 Z" fill="${stroke}" stroke="none" opacity="0.7"/><path d="M30 36 v8 M26 42 l8 0"/>`);
    case 'filter': return wrap(`<circle cx="26" cy="30" r="12"/><g>${[0,1,2,3,4].map(i => { const a = -0.5 + i * 0.25; const x = 38 + Math.cos(a)*12, y = 30 + Math.sin(a)*12; return `<line x1="38" y1="30" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}</g>`);
    case 'mandibles': return wrap(`<circle cx="26" cy="30" r="12"/><path d="M38 24 Q48 28 42 32 Q48 36 38 38" fill="${stroke}" stroke="none" opacity="0.65"/>`);
    case 'fins':   return wrap(`<ellipse cx="30" cy="30" rx="14" ry="10"/><path d="M28 20 Q18 12 18 20 L26 22 Z" fill="${stroke}" stroke="none" opacity="0.5"/><path d="M28 40 Q18 48 18 40 L26 38 Z" fill="${stroke}" stroke="none" opacity="0.5"/>`);
    case 'camo':   return wrap(`<circle cx="30" cy="30" r="14" stroke-dasharray="4 4" opacity="0.7"/><circle cx="30" cy="30" r="20" stroke-dasharray="2 6" opacity="0.4"/>`);
    case 'meta':   return wrap(`<circle cx="30" cy="30" r="14"/><path d="M30 22 v8 l6 4"/>`);
    case 'gut':    return wrap(`<ellipse cx="30" cy="30" rx="16" ry="12"/><path d="M20 30 Q30 24 40 30 Q30 36 20 30"/>`);
    case 'shell':  return wrap(`<path d="M16 32 Q30 14 44 32 L44 38 L16 38 Z"/><path d="M22 32 Q30 22 38 32"/>`);
    case 'sense':  return wrap(`<circle cx="30" cy="30" r="6"/><circle cx="30" cy="30" r="14" opacity="0.6"/><circle cx="30" cy="30" r="22" opacity="0.3"/>`);
    case 'phero':  return wrap(`<circle cx="30" cy="30" r="10"/><circle cx="46" cy="22" r="3"/><circle cx="46" cy="38" r="3"/><circle cx="14" cy="30" r="3"/>`);
    case 'fang':   return wrap(`<path d="M18 12 L22 38 L30 28 L38 38 L42 12" fill="${stroke}" stroke="none" opacity="0.7"/><path d="M18 12 L22 38 L30 28 L38 38 L42 12" />`);
    case 'leaf':   return wrap(`<path d="M30 50 Q10 30 20 15 Q30 8 40 15 Q50 30 30 50 Z" fill="${stroke}" stroke="none" opacity="0.6"/><line x1="30" y1="50" x2="30" y2="15"/>`);
    default: return wrap(`<circle cx="30" cy="30" r="14"/>`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE / LOAD
// ─────────────────────────────────────────────────────────────────────────────
const Save = {
  key: 'drift.micro-eco.v1',
  load() {
    try {
      const s = localStorage.getItem(this.key);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  },
  save(data) {
    try { localStorage.setItem(this.key, JSON.stringify(data)); } catch (e) {}
  },
  recordRun(seedString, run) {
    const cur = this.load() || { runs: 0, bestTime: 0, bestSize: 0, legendaries: [], seeds: [] };
    cur.runs = (cur.runs || 0) + 1;
    if (run.time > (cur.bestTime || 0)) cur.bestTime = run.time;
    if (run.maxSize > (cur.bestSize || 0)) cur.bestSize = run.maxSize;
    cur.legendaries = Array.from(new Set([...(cur.legendaries || []), ...run.legendaries]));
    cur.seeds = (cur.seeds || []).slice(-9);
    cur.seeds.push({ seed: seedString, t: run.time, size: run.maxSize });
    cur.lastSeed = seedString;
    this.save(cur);
  }
};

const SoftSwimTuning = (() => {
  // Body-deformation parameters for the three propulsion visuals. (Heading
  // tracking lives in _advanceVisualHeading and reads no tuning fields.)
  const defaults = {
    finFreqBase: 1.20,
    finFreqSpeed: 1.00,
    finRearSweepBase: 0.010,
    finRearSweepSpeed: 0.018,
    finBend: 0.009,
    finForwardSweep: 0.008,
    pulseFreqBase: 1.50,
    pulseFreqSpeed: 1.70,
    pulseContractFwd: 0.12,
    pulseRearJet: 0.010,
    pulseForwardJet: 0.040,
    wriggleFreqBase: 2.10,
    wriggleFreqSpeed: 2.10,
    // Wave amplitudes are multipliers on body radius.
    wriggleAmpBase: 0.08,
    wriggleAmpSpeed: 0.18,
    wriggleTravel: 0.95,
    wriggleForward: 0.020,
    wriggleBend: 0.025,
  };
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem('drift.softSwim.tuning') || '{}');
  } catch (e) {}

  const tuning = {};
  for (const key in defaults) {
    tuning[key] = (key in stored && typeof stored[key] === 'number') ? stored[key] : defaults[key];
  }
  tuning.defaults = defaults;
  tuning.save = () => {
    const out = {};
    for (const key in defaults) out[key] = tuning[key];
    try {
      localStorage.setItem('drift.softSwim.tuning', JSON.stringify(out));
    } catch (e) {}
  };
  return tuning;
})();
window.DriftSoftSwimTuning = SoftSwimTuning;

// ─────────────────────────────────────────────────────────────────────────────
// GAME
// ─────────────────────────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ui = new UI();
    this.particles = new ParticlePool(700);
    this.grid = new SpatialGrid(T.GRID_CELL);
    this.creatures = [];
    this.softCreatures = [];
    this.softPlayer = null;
    this.softCreatureLookup = new Map();
    this.foods = [];
    this.partShards = [];
    this.hazards = [];
    this.plants = [];
    this.rocks = [];
    this.eggs = [];
    this.player = null;
    this.camX = 0; this.camY = 0;
    this.zoom = 1.0;
    this.running = false;
    this.paused = false;
    this.lastT = 0;
    this.seed = 0;
    this.seedString = '';
    this.rng = Math.random;
    this.director = null;
    this.goals = null;
    this.softSwimTuning = SoftSwimTuning;
    this._scratch = [];
    this.lastBiomeId = null;
    this.codexRecent = '';
    this.gameOver = false;
    this._devWasPaused = false;
    this._softSpawnSerial = 0;
    this.generatedRockRings = new Set();
    this.isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
    if (this.isMobile) {
      T.CREATURE_CAP = Math.min(T.CREATURE_CAP, 96);
      T.FOOD_CAP = Math.min(T.FOOD_CAP, 170);
      T.HAZARD_CAP = Math.min(T.HAZARD_CAP, 16);
      T.PLANT_CAP = Math.min(T.PLANT_CAP, 12);
    }
    this.embed = !!CFG.embedMode;
    if (this.embed) document.body.classList.add('embed');

    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.attach(this.canvas);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        e.preventDefault();
        this.toggleDevTools();
        return;
      }
      if (e.key === 'Escape' && this.ui.el.devTools && this.ui.el.devTools.classList.contains('show')) {
        e.preventDefault();
        this.toggleDevTools(false);
        return;
      }
      if (e.key === 'Escape' && this.running && !this.gameOver && !this.mutationActive && !this.milestoneActive) {
        e.preventDefault();
        this.setPaused(!this.paused);
      }
    });

    this.ui.el.startBtn.addEventListener('click', () => this.startFromIntro());
    this.ui.el.restartBtn.addEventListener('click', () => this.restart());
    this.ui.el.resumeBtn.addEventListener('click', () => this.setPaused(false));
    if (this.ui.el.audioBtn) this.ui.el.audioBtn.addEventListener('click', () => this.toggleAudio());
    if (this.ui.el.pauseSettingsBtn) this.ui.el.pauseSettingsBtn.addEventListener('click', () => this.ui.showPauseSettings(true));
    if (this.ui.el.pauseSettingsCloseBtn) this.ui.el.pauseSettingsCloseBtn.addEventListener('click', () => this.ui.showPauseSettings(false));
    if (this.ui.el.pauseAudioBtn) this.ui.el.pauseAudioBtn.addEventListener('click', () => this.toggleAudio());
    if (this.ui.el.pauseResetZoomBtn) this.ui.el.pauseResetZoomBtn.addEventListener('click', () => { this.zoom = this.isMobile ? 0.9 : 1.0; });
    if (this.ui.el.pauseQuitMenuBtn) this.ui.el.pauseQuitMenuBtn.addEventListener('click', () => this.quitToMenu());
    if (this.ui.el.pauseQuitDesktopBtn) this.ui.el.pauseQuitDesktopBtn.addEventListener('click', () => this.quitToDesktop());

    // Controls rebinding panel
    if (this.ui.el.pauseControlsBtn) {
      this.ui.el.pauseControlsBtn.addEventListener('click', () => {
        const panel = this.ui.el.controlsRebindPanel;
        if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (this.ui.el.controlsResetBtn) {
      this.ui.el.controlsResetBtn.addEventListener('click', () => {
        Controls.reset();
        this._updateRebindLabels();
      });
    }
    // Wire rebind buttons
    this._rebindListening = null;
    this._initRebindButtons();

    // Action menu close
    const actionMenuCloseBtn = document.getElementById('action-menu-close-btn');
    if (actionMenuCloseBtn) actionMenuCloseBtn.addEventListener('click', () => this.toggleActionMenu());
    if (this.ui.el.devCloseBtn) this.ui.el.devCloseBtn.addEventListener('click', () => this.toggleDevTools(false));
    if (this.ui.el.devSoftToggleBtn) this.ui.el.devSoftToggleBtn.addEventListener('click', () => this.setSoftCreaturesEnabled(!this.softCreaturesEnabled()));
    if (this.ui.el.devSoftRespawnBtn) this.ui.el.devSoftRespawnBtn.addEventListener('click', () => {
      this.rebuildSoftCreatures();
      this.ui.toast('SOFT CREATURES · RESPAWNED');
    });
    if (this.ui.el.devOpenLabBtn) this.ui.el.devOpenLabBtn.addEventListener('click', () => {
      window.location.href = 'creature-lab.html';
    });
    this.ui.setSoftCreatureStatus(this.softCreaturesEnabled(), this.softCreatures.length);

    // ── Dev menu accordion (reduce on-screen complexity) ──────────────────
    this._initDevAccordionUI();

    // ── Main-game soft swim dev sliders ────────────────────────────────────
    this._initSoftSwimDevUI();

    // ── Creature Stats dev sliders ──────────────────────────────────────────
    this._initCreatureStatsDevUI();

    // ── Growth-threshold inputs ────────────────────────────────────────────
    this._initGrowthThresholdsDevUI();

    // pre-fill seed from URL param or save
    const save = Save.load();
    const urlSeed = CFG.seed && CFG.seed !== 'random' ? CFG.seed : null;
    if (urlSeed) {
      this.ui.el.seedInput.value = urlSeed;
    } else if (save && save.lastSeed) {
      this.ui.el.seedInput.placeholder = `last: ${save.lastSeed}`;
    }
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = CFG.width || this.canvas.parentElement.clientWidth;
    const h = CFG.height || this.canvas.parentElement.clientHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = w; this.viewH = h;
  }

  getVisibleRadius() {
    return (Math.max(this.viewW, this.viewH) * 0.62) / Math.max(0.25, this.zoom);
  }

  getBaseVisibleRadius() {
    // 100% zoom baseline used for spawn-safety exclusion.
    return Math.max(this.viewW, this.viewH) * 0.62;
  }

  getSpawnExclusionRadius() {
    // Keep runtime spawns at least 150% of baseline (100% zoom) view radius.
    return this.getBaseVisibleRadius() * 1.5;
  }

  getRenderRadius() {
    return this.getVisibleRadius() * 1.5;
  }

  getActiveRadius() {
    return this.getRenderRadius() * 1.25;
  }

  getRingIndexByRadius(r) {
    return Math.max(1, Math.floor(r / RING_SIZE) + 1);
  }

  getRingIndexAt(x, y) {
    return this.getRingIndexByRadius(Math.hypot(x, y));
  }

  getOutwardTierByRing(ring) {
    return Math.max(0, Math.floor((ring - 1) / 4));
  }

  getOutwardScaleByRing(ring) {
    return Math.min(5.4, Math.pow(1.3, this.getOutwardTierByRing(ring)));
  }

  getOutwardScaleAt(x, y) {
    return this.getOutwardScaleByRing(this.getRingIndexAt(x, y));
  }

  getCurrentVectorAt(x, y) {
    const t = performance.now() * 0.00008;
    const a = t + Math.sin(x * 0.00085) * 0.8 + Math.cos(y * 0.00072) * 0.6;
    const mag = 6.5 + Math.sin(t * 1.7 + x * 0.0003 - y * 0.00028) * 1.8;
    return { x: Math.cos(a) * mag, y: Math.sin(a) * mag };
  }

  toggleAudio() {
    if (Audio.enabled) { Audio.disable(); this.ui.setAudioLabel(false); }
    else { Audio.enable(); this.ui.setAudioLabel(true); }
  }

  softCreaturesEnabled() {
    return !!window.DRIFT_USE_SOFT_CREATURES && !!window.DriftCreatures && typeof window.DriftCreatures.createCreature === 'function';
  }

// ── Controls rebinding helpers ─────────────────────────────────────────────
  _initRebindButtons() {
    const buttons = document.querySelectorAll('.bind-btn[data-action]');
    this._updateRebindLabels();
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._rebindListening) {
          this._rebindListening.classList.remove('listening');
          this._rebindListening.textContent = Controls.labelFor(this._rebindListening.dataset.action);
          this._rebindListening = null;
        }
        btn.classList.add('listening');
        btn.textContent = '…';
        this._rebindListening = btn;
      });
    });
    // Capture the next keydown to assign the binding
    window.addEventListener('keydown', (e) => {
      if (!this._rebindListening) return;
      e.preventDefault();
      e.stopPropagation();
      const action = this._rebindListening.dataset.action;
      if (e.key !== 'Escape') {
        Controls.bind(action, e.key);
      }
      this._rebindListening.classList.remove('listening');
      this._rebindListening.textContent = Controls.labelFor(action);
      this._rebindListening = null;
    }, true); // capture phase so it fires before other listeners
  }

  _updateRebindLabels() {
    document.querySelectorAll('.bind-btn[data-action]').forEach(btn => {
      btn.textContent = Controls.labelFor(btn.dataset.action);
    });
  }

  _initDevAccordionUI() {
    const grid = this.ui && this.ui.el && this.ui.el.devTools
      ? this.ui.el.devTools.querySelector('.dev-grid')
      : null;
    if (!grid) return;

    const blocks = Array.from(grid.querySelectorAll(':scope > .dev-block'));
    if (!blocks.length) return;

    const collapseOthers = (openBlock) => {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const header = block.querySelector('h4');
        const isOpen = block === openBlock;
        block.classList.toggle('collapsed', !isOpen);
        if (header) header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
    };

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.dataset.accordionReady === '1') continue;
      const header = block.querySelector('h4');
      if (!header) continue;

      const body = document.createElement('div');
      body.className = 'dev-block-body';
      let node = header.nextSibling;
      while (node) {
        const next = node.nextSibling;
        body.appendChild(node);
        node = next;
      }
      block.appendChild(body);

      block.classList.add('dev-collapsible');
      const openByDefault = false;
      block.classList.toggle('collapsed', !openByDefault);
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', openByDefault ? 'true' : 'false');

      const toggle = () => {
        const shouldOpen = block.classList.contains('collapsed');
        if (shouldOpen) collapseOthers(block);
        else {
          block.classList.add('collapsed');
          header.setAttribute('aria-expanded', 'false');
        }
      };

      header.addEventListener('click', toggle);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });

      block.dataset.accordionReady = '1';
    }
  }

  // ── Creature Stats dev panel ───────────────────────────────────────────────
  _initSoftSwimDevUI() {
    const tuning = this.softSwimTuning;
    if (!tuning) return;

    const rows = [
      ['dev-fin-freq-base', 'dev-fin-freq-base-val', 'finFreqBase', v => v.toFixed(2)],
      ['dev-fin-freq-speed', 'dev-fin-freq-speed-val', 'finFreqSpeed', v => v.toFixed(2)],
      ['dev-fin-rear-sweep-base', 'dev-fin-rear-sweep-base-val', 'finRearSweepBase', v => v.toFixed(3)],
      ['dev-fin-rear-sweep-speed', 'dev-fin-rear-sweep-speed-val', 'finRearSweepSpeed', v => v.toFixed(3)],
      ['dev-fin-bend', 'dev-fin-bend-val', 'finBend', v => v.toFixed(3)],
      ['dev-fin-forward-sweep', 'dev-fin-forward-sweep-val', 'finForwardSweep', v => v.toFixed(3)],
      ['dev-pulse-freq-base', 'dev-pulse-freq-base-val', 'pulseFreqBase', v => v.toFixed(2)],
      ['dev-pulse-freq-speed', 'dev-pulse-freq-speed-val', 'pulseFreqSpeed', v => v.toFixed(2)],
      ['dev-pulse-contract-fwd', 'dev-pulse-contract-fwd-val', 'pulseContractFwd', v => v.toFixed(3)],
      ['dev-pulse-rear-jet', 'dev-pulse-rear-jet-val', 'pulseRearJet', v => v.toFixed(3)],
      ['dev-pulse-forward-jet', 'dev-pulse-forward-jet-val', 'pulseForwardJet', v => v.toFixed(3)],
      ['dev-wriggle-freq-base',  'dev-wriggle-freq-base-val',  'wriggleFreqBase',  v => v.toFixed(2)],
      ['dev-wriggle-freq-speed', 'dev-wriggle-freq-speed-val', 'wriggleFreqSpeed', v => v.toFixed(2)],
      ['dev-wriggle-amp-base',   'dev-wriggle-amp-base-val',   'wriggleAmpBase',   v => v.toFixed(3)],
      ['dev-wriggle-amp-speed',  'dev-wriggle-amp-speed-val',  'wriggleAmpSpeed',  v => v.toFixed(3)],
      ['dev-wriggle-travel',     'dev-wriggle-travel-val',     'wriggleTravel',    v => v.toFixed(2)],
      ['dev-wriggle-forward',    'dev-wriggle-forward-val',    'wriggleForward',   v => v.toFixed(3)],
      ['dev-wriggle-bend',       'dev-wriggle-bend-val',       'wriggleBend',      v => v.toFixed(3)],
    ];

    const syncReadouts = () => {
      for (const [sid, rid, key, fmt] of rows) {
        const readout = document.getElementById(rid);
        const slider = document.getElementById(sid);
        if (readout) readout.textContent = fmt(tuning[key]);
        if (slider) slider.value = tuning[key];
      }
    };

    for (const [sid, rid, key, fmt] of rows) {
      const slider = document.getElementById(sid);
      const readout = document.getElementById(rid);
      if (!slider) continue;
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        if (!Number.isFinite(v)) return;
        tuning[key] = v;
        if (readout) readout.textContent = fmt(v);
        tuning.save();
      });
    }

    const resetBtn = document.getElementById('dev-soft-swim-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        for (const key in tuning.defaults) tuning[key] = tuning.defaults[key];
        tuning.save();
        syncReadouts();
        this.ui.toast('SOFT SWIM · DEFAULTS RESTORED');
      });
    }

    const copyBtn = document.getElementById('dev-soft-swim-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const lines = [
          '// ── Paste into SoftSwimTuning defaults in game.js ──',
          `finFreqBase:      ${tuning.finFreqBase},`,
          `finFreqSpeed:     ${tuning.finFreqSpeed},`,
          `finRearSweepBase: ${tuning.finRearSweepBase},`,
          `finRearSweepSpeed:${tuning.finRearSweepSpeed},`,
          `finBend:          ${tuning.finBend},`,
          `finForwardSweep:  ${tuning.finForwardSweep},`,
          `pulseFreqBase:    ${tuning.pulseFreqBase},`,
          `pulseFreqSpeed:   ${tuning.pulseFreqSpeed},`,
          `pulseContractFwd: ${tuning.pulseContractFwd},`,
          `pulseRearJet:     ${tuning.pulseRearJet},`,
          `pulseForwardJet:  ${tuning.pulseForwardJet},`,
          `wriggleFreqBase:  ${tuning.wriggleFreqBase},`,
          `wriggleFreqSpeed: ${tuning.wriggleFreqSpeed},`,
          `wriggleAmpBase:   ${tuning.wriggleAmpBase},`,
          `wriggleAmpSpeed:  ${tuning.wriggleAmpSpeed},`,
          `wriggleTravel:    ${tuning.wriggleTravel},`,
          `wriggleForward:   ${tuning.wriggleForward},`,
          `wriggleBend:      ${tuning.wriggleBend},`,
        ];
        const text = lines.join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(() => this.ui.toast('SOFT SWIM CONFIG COPIED'))
            .catch(() => { console.log(text); this.ui.toast('SEE CONSOLE FOR SOFT SWIM CONFIG'); });
        } else {
          console.log(text);
          this.ui.toast('SEE CONSOLE FOR SOFT SWIM CONFIG');
        }
      });
    }

    const origShow = this.ui.showDevTools.bind(this.ui);
    this.ui.showDevTools = (on) => {
      origShow(on);
      if (on) syncReadouts();
    };

    syncReadouts();
  }

  // Growth-level threshold inputs. Each row binds a number input in
  // index.html to a key on window.GROWTH_THRESHOLDS. Inputs are written
  // live so other systems pick up the new value next frame.
  _initGrowthThresholdsDevUI() {
    const G = window.GROWTH_THRESHOLDS;
    if (!G) return;
    const rows = [
      ['dev-growth-npc-mate',       'npcMateMin',     'NPC mating min growth'],
      ['dev-growth-plant-chunk',    'plantChunkEat',  'Eat plant chunks at growth'],
      ['dev-growth-plant-leaf',     'plantLeafEat',   'Eat plant leaves at growth'],
      ['dev-growth-plant-node',     'plantNodeEat',   'Eat plant nodes at growth'],
      ['dev-growth-branch-push',    'branchPushable', 'Branch tier becomes pushable'],
      ['dev-growth-subbranch',      'subbranchTier',  'Branch tier for subbranching'],
    ];
    for (const [inputId, key] of rows) {
      const input = document.getElementById(inputId);
      if (!input) continue;
      input.value = G[key];
      input.addEventListener('input', () => {
        const v = parseInt(input.value, 10);
        if (Number.isFinite(v) && v >= 0 && v <= 9) G[key] = v;
      });
    }
  }

  _initCreatureStatsDevUI() {
    const tuning = window.DriftCreatures && window.DriftCreatures.tuning;
    if (!tuning) return;

    // Map: [sliderId, readoutId, tuningKey, fmt]
    const rows = [
      ['dev-speed-base',  'dev-speed-base-val',  'speedBase',      v => String(Math.round(v))],
      ['dev-speed-max',   'dev-speed-max-val',   'speedMax',       v => String(Math.round(v))],
      ['dev-speed-gmul',  'dev-speed-gmul-val',  'speedGrowthMul', v => v.toFixed(2) + '×'],
      ['dev-damage-base', 'dev-damage-base-val', 'damageBase',     v => String(Math.round(v))],
      ['dev-damage-gmul', 'dev-damage-gmul-val', 'damageGrowthMul',v => v.toFixed(2) + '×'],
      ['dev-turn-base',   'dev-turn-base-val',   'turnBase',       v => v.toFixed(2)],
      ['dev-turn-max',    'dev-turn-max-val',    'turnMax',        v => v.toFixed(2)],
      ['dev-turn-gmul',   'dev-turn-gmul-val',   'turnGrowthMul',  v => v.toFixed(2) + '×'],
      ['dev-aware-base',  'dev-aware-base-val',  'awareBase',      v => String(Math.round(v))],
      ['dev-aware-max',   'dev-aware-max-val',   'awareMax',       v => String(Math.round(v))],
      ['dev-aware-gmul',  'dev-aware-gmul-val',  'awareGrowthMul', v => v.toFixed(2) + '×'],
    ];

    const syncReadouts = () => {
      for (const [sid, rid, key, fmt] of rows) {
        const readout = document.getElementById(rid);
        const slider  = document.getElementById(sid);
        if (readout) readout.textContent = fmt(tuning[key]);
        if (slider)  slider.value = tuning[key];
      }
    };

    // Wire each slider to update tuning + save
    for (const [sid, rid, key, fmt] of rows) {
      const slider  = document.getElementById(sid);
      const readout = document.getElementById(rid);
      if (!slider) continue;
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        if (Number.isFinite(v)) {
          tuning[key] = v;
          if (readout) readout.textContent = fmt(v);
          tuning.save();
        }
      });
    }

    // Reset to defaults
    const resetBtn = document.getElementById('dev-stats-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        for (const k in tuning.defaults) tuning[k] = tuning.defaults[k];
        tuning.save();
        syncReadouts();
        this.ui.toast('CREATURE STATS · DEFAULTS RESTORED');
      });
    }

    // Copy config to clipboard
    const copyBtn = document.getElementById('dev-stats-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const lines = [
          '// ── Paste these lines into the DriftCreatures.tuning defaults block ──',
          '//    in js/creatures/creature-genome.js',
          `speedBase:      ${tuning.speedBase},`,
          `speedMax:       ${tuning.speedMax},`,
          `speedGrowthMul: ${tuning.speedGrowthMul},`,
          `damageBase:     ${tuning.damageBase},`,
          `damageGrowthMul:${tuning.damageGrowthMul},`,
          `turnBase:       ${tuning.turnBase},`,
          `turnMax:        ${tuning.turnMax},`,
          `turnGrowthMul:  ${tuning.turnGrowthMul},`,
          `awareBase:      ${tuning.awareBase},`,
          `awareMax:       ${tuning.awareMax},`,
          `awareGrowthMul: ${tuning.awareGrowthMul},`,
        ];
        const text = lines.join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(() => this.ui.toast('CONFIG COPIED TO CLIPBOARD'))
            .catch(() => { console.log(text); this.ui.toast('SEE CONSOLE FOR CONFIG'); });
        } else {
          console.log(text);
          this.ui.toast('SEE CONSOLE FOR CONFIG');
        }
      });
    }

    // Sync readouts whenever the dev panel opens
    const origShow = this.ui.showDevTools.bind(this.ui);
    this.ui.showDevTools = (on) => {
      origShow(on);
      if (on) syncReadouts();
    };

    // Initial sync in case panel is already open
    syncReadouts();
  }

  toggleDevTools(force) {
    const isOpen = !!(this.ui.el.devTools && this.ui.el.devTools.classList.contains('show'));
    const next = force === undefined ? !isOpen : !!force;
    if (next === isOpen) return;

    if (next) {
      this._devWasPaused = this.paused;
      this.paused = true;
      this.ui.showPause(false);
      this.ui.showPauseSettings(false);
      this.ui.setSoftCreatureStatus(this.softCreaturesEnabled(), this.softCreatures.length);
    } else {
      this.paused = this._devWasPaused;
      this._devWasPaused = false;
    }

    this.ui.showDevTools(next);
  }

  setSoftCreaturesEnabled(enabled) {
    const next = !!enabled && !!window.DriftCreatures && typeof window.DriftCreatures.createCreature === 'function';
    window.DRIFT_USE_SOFT_CREATURES = next;
    if (next) this.rebuildSoftCreatures();
    else {
      this.softCreatures.length = 0;
      this.softPlayer = null;
      this.softCreatureLookup.clear();
    }
    this.ui.setSoftCreatureStatus(this.softCreaturesEnabled(), this.softCreatures.length);
    this.ui.toast(next ? 'SOFT CREATURES · ON' : 'SOFT CREATURES · OFF');
  }

  getSoftSourceParts(source) {
    if (Array.isArray(source.parts)) return source.parts.slice();
    if (source.discoveredParts && typeof source.discoveredParts.values === 'function') return Array.from(source.discoveredParts);
    return [];
  }

  getBiomeTierNumberAt(x, y) {
    const biome = biomeAt(Math.hypot(x, y));
    const idx = BIOMES.findIndex((b) => b.id === biome.id);
    return clamp(idx + 1, 1, 3);
  }

  getSoftPartTypeForLegacy(partId) {
    switch (partId) {
      case 'eyespot': return 'eye';
      case 'mandible': return 'carnivoreMouth';
      case 'filtermouth': return 'herbivoreMouth';
      case 'fin': return 'fin';
      case 'cilia': return 'fin';
      case 'tendril': return 'weapon';
      case 'tail': return 'tail';
      case 'spike': return 'weapon';
      case 'plate': return 'defense';
      case 'frill': return 'defense';
      default: return null;
    }
  }

  getSoftPartVariantCount(type) {
    if (type === 'eye') return 5;
    if (type === 'herbivoreMouth' || type === 'carnivoreMouth' || type === 'omnivoreMouth') return 25;
    if (type === 'fin' || type === 'tail' || type === 'weapon' || type === 'defense') return 25;
    return 12;
  }

  // NPC propulsion drives the visual style directly:
  //   burst → pulse, glide/fin → fin, wriggle → wriggle
  // Player has no propulsion field, so falls back to the genome hint.
  _resolveSoftMovementStyle(source, style) {
    if (source && source.propulsion) {
      return source.propulsion === 'burst'   ? 'pulse'
           : source.propulsion === 'wriggle' ? 'wriggle'
           : 'fin';
    }
    return style === 'pulse' ? 'pulse'
         : style === 'fin'   ? 'fin'
         : 'wriggle';
  }

  hslToSoftHex(h, s, l) {
    const hue = (((h % 360) + 360) % 360) / 360;
    const sat = clamp((s || 60) / 100, 0, 1);
    const lig = clamp((l || 60) / 100, 0, 1);
    let r, g, b;

    if (sat === 0) {
      r = g = b = lig;
    } else {
      const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
      const p = 2 * lig - q;
      const hue2rgb = (t) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
      };
      r = hue2rgb(hue + 1 / 3);
      g = hue2rgb(hue);
      b = hue2rgb(hue - 1 / 3);
    }

    const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  createSoftVisualForCreature(source) {
    const D = window.DriftCreatures;

    // Use the same seeded genome system as the creature lab.
    // This gives each creature varied elongation (0.82–1.55), rich part
    // compositions (fins, tails, weapons, defense), and varied wobble/softness
    // — instead of the flat manual genome that produced identical round bodies.
    const genomeSeed = hashStringSeed(
      String(source.bornAt || 0) + ':' +
      (source.templateId || source.name || source.kind || 'entity')
    ) % 999983;

    // Higher tier = more parts (weapons, defense) if the creature has grown.
    const tier = Math.max(1, Math.min(3, (source.growthLevel || 0) + 1));

    const genome = D.generateCreatureGenome(genomeSeed, tier);

    // Main game visuals only support three clear propulsion families.
    // Normalize lab styles into: fin (glide), pulse (burst), wriggle (flappy).
    genome.movement.style = this._resolveSoftMovementStyle(source, genome.movement.style);

    // Scale part sizes proportionally so the visual matches the source radius.
    const scaleRatio = (source.r * 0.92) / Math.max(1, genome.body.baseRadius);
    genome.body.baseRadius = source.r * 0.92;
    for (let i = 0; i < genome.parts.length; i++) {
      genome.parts[i].size *= scaleRatio;
    }

    // Override colors from the source creature to preserve biome/ecosystem identity.
    const hue    = Number.isFinite(source.hue) ? source.hue : (Number.isFinite(source.creatorHue) ? source.creatorHue : 190);
    const sat    = Number.isFinite(source.sat) ? source.sat : 64;
    const light  = Number.isFinite(source.light) ? source.light : 62;
    genome.colors.body   = this.hslToSoftHex(hue, sat, light);
    genome.colors.accent = this.hslToSoftHex(hue + 18, Math.min(100, sat + 12), Math.min(92, light + 14));
    genome.colors.detail = this.hslToSoftHex(hue - 24, Math.max(18, sat * 0.55), Math.max(12, light * 0.35));

    // Ensure body is created at full size (not juvenile) since size is driven by the legacy sim.
    genome.growth.juvenileScale = 1;
    genome.growth.adultScale    = 1;
    genome.growth.growthRate    = 0;

    const creature = new D.Creature(genome, source.x, source.y);
    creature.sourceCreature   = source;
    creature.baseSourceRadius = Math.max(1, source.r);
    creature.motionPhase      = (genomeSeed % 997) / 997;
    creature.isLegendary      = !!source.legendary;
    creature.label            = source.legendary ? source.name : '';
    // Stagger animation phase so creatures don't all wiggle in sync.
    creature.time             = (genomeSeed % 997) / 997 * 3.0;
    creature.growthLevel      = source.growthLevel || 0;
    creature.growth.currentScale   = 1;
    creature.growth.growthProgress = 1;
    creature.growth.pendingGrowth  = 0;
    creature.growth.isAdult        = true;
    creature.isPlayer   = !!source.isPlayer;
    if (source.isPlayer) creature.label = 'You';
    for (let i = 0; i < creature.parts.length; i++) {
      creature.parts[i].growth = 1;
      creature.parts[i].active = true;
    }
    return creature;
  }

  ensureSoftPlayerCreature() {
    if (!this.softCreaturesEnabled() || !this.player) {
      this.softPlayer = null;
      return;
    }
    if (!this.softPlayer || this.softPlayer.sourceCreature !== this.player) {
      this.softPlayer = this.createSoftVisualForCreature(this.player);
      this.softPlayer.isPlayer = true;
      this.softPlayer.label = 'You';
      this.softPlayer.sourceCreature = this.player;
      this.softPlayer.baseSourceRadius = Math.max(1, this.player.r);
    }
  }

  syncSoftPlayerVisual(dt) {
    if (!this.softCreaturesEnabled() || !this.player) return;
    this.ensureSoftPlayerCreature();
    if (!this.softPlayer) return;
    const p = this.player;
    const visual = this.softPlayer;

    visual.time       += dt;
    visual.isPlayer    = true;
    visual.label       = 'You';
    visual.hitFlash    = p.hitFlash    || 0;
    visual.growthPulse = p.growthPulse || 0;
    visual.eatenMark   = p.eatenMark   || 0;
    visual.growthLevel = p.growthLevel || 0;
    visual._targetR    = p.r;
    visual.genome.movement.style = this._resolveSoftMovementStyle(p, visual.genome.movement.style);

    const speed = Math.hypot(p.vx || 0, p.vy || 0);
    const tracked = this._advanceVisualHeading(visual, dt, p.angle, speed);

    for (let i = 0; i < visual.parts.length; i++) window.DriftCreatures.updateCreaturePart(visual.parts[i], dt);
    this._swimBodyWave(visual, dt, tracked.heading, speed, tracked.turnRate, p.x, p.y);
  }

  // Single-source visual heading tracker. Both source.angle (player/NPC) and
  // velocity are now smooth and consistent, so the visual just needs to chase
  // source.angle at a rate-limited speed. The old two-stage solver (track
  // velocity, then stabilize toward source.angle) pulled in opposite
  // directions during turns and produced the "snap back and forth" rhythm.
  _advanceVisualHeading(visual, dt, targetAngle, speed) {
    const prevH = Number.isFinite(visual.heading) ? visual.heading : (Number.isFinite(targetAngle) ? targetAngle : 0);
    if (!Number.isFinite(targetAngle)) {
      return { heading: prevH, turnRate: visual.turnRate || 0 };
    }
    let delta = targetAngle - prevH;
    while (delta >  Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    // Faster turn at speed so darts look reactive; floor so stopped creatures
    // can still rotate.
    const rateCap = 3.6 + Math.min(2.8, (speed || 0) * 0.04);
    const maxStep = rateCap * Math.max(dt, 0.001);
    const step = Math.max(-maxStep, Math.min(maxStep, delta));
    const heading = prevH + step;
    const rawTurnRate = step / Math.max(dt, 0.001);
    const prevTurn = Number.isFinite(visual.turnRate) ? visual.turnRate : 0;
    // Light smoothing on the reported turnRate so the body's wave/bend term
    // doesn't twitch frame-to-frame.
    const turnKeep = 0.6;
    const turnRate = prevTurn * turnKeep + rawTurnRate * (1 - turnKeep);
    return { heading, turnRate };
  }

  drawSoftPlayer(ctx, w, h) {
    if (!this.softCreaturesEnabled() || !this.softPlayer) return;
    const D = window.DriftCreatures;
    const creature = this.softPlayer;
    const center = D.getBodyCenter(creature.body);
    const visibleR = this.getRenderRadius() + 260;
    const dx = center.x - this.camX;
    const dy = center.y - this.camY;
    if (dx * dx + dy * dy > visibleR * visibleR) return;

    ctx.save();
    ctx.translate(-this.camX + w * 0.5, -this.camY + h * 0.5);
    creature.render(ctx);
    ctx.restore();
  }

  rebuildSoftCreatures() {
    this.softCreatures.length = 0;
    this.softCreatureLookup.clear();
    this.softPlayer = null;
    if (!this.softCreaturesEnabled() || !this.player) {
      this.ui.setSoftCreatureStatus(this.softCreaturesEnabled(), this.softCreatures.length);
      return;
    }

    this.ensureSoftPlayerCreature();

    for (let i = 0; i < this.creatures.length; i++) {
      const source = this.creatures[i];
      if (!source || source.dead) continue;
      const visual = this.createSoftVisualForCreature(source);
      this.softCreatureLookup.set(source, visual);
      this.softCreatures.push(visual);
    }
    this.ui.setSoftCreatureStatus(this.softCreaturesEnabled(), this.softCreatures.length);
  }

  ensureSoftCreatures() {
    if (!this.softCreaturesEnabled()) return;

    this.ensureSoftPlayerCreature();

    const live = new Set();
    for (let i = 0; i < this.creatures.length; i++) {
      const source = this.creatures[i];
      if (!source || source.dead) continue;
      live.add(source);
      if (!this.softCreatureLookup.has(source)) {
        const visual = this.createSoftVisualForCreature(source);
        this.softCreatureLookup.set(source, visual);
        this.softCreatures.push(visual);
      }
    }

    this.softCreatures = this.softCreatures.filter((visual) => live.has(visual.sourceCreature));
    for (const [source] of Array.from(this.softCreatureLookup.entries())) {
      if (!live.has(source)) this.softCreatureLookup.delete(source);
    }
    this.ui.setSoftCreatureStatus(this.softCreaturesEnabled(), this.softCreatures.length);
  }

  resolveSoftCreatureRockCollisions() {
    if (!this.softCreaturesEnabled()) return;

    for (let i = 0; i < this.softCreatures.length; i++) {
      const creature = this.softCreatures[i];
      const center = window.DriftCreatures.getBodyCenter(creature.body);
      const approxR = creature.getApproxSize();

      for (let r = 0; r < this.rocks.length; r++) {
        const rock = this.rocks[r];
        const cdx = center.x - rock.x;
        const cdy = center.y - rock.y;
        if (cdx * cdx + cdy * cdy > (rock.maxR + approxR + 24) * (rock.maxR + approxR + 24)) continue;

        for (let n = 0; n < creature.body.nodes.length; n++) {
          const node = creature.body.nodes[n];
          const dx = node.x - rock.x;
          const dy = node.y - rock.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          if (d > rock.maxR + 6) continue;
          const angle = Math.atan2(dy, dx);
          const rockR = rock._effectiveRadiusForCircle(angle, d, 2.2);
          if (d >= rockR + 1.2) continue;
          const nx = dx / d;
          const ny = dy / d;
          node.x = rock.x + nx * (rockR + 1.2);
          node.y = rock.y + ny * (rockR + 1.2);
        }
      }

      window.DriftCreatures.solveSoftBodyConstraints(creature.body);
      window.DriftCreatures.applySoftBodyPressure(creature.body);
    }
  }

  // ── Kinematic Propulsion Profiles ───────────────────────────────────────────
  // Shared solver for all soft visuals. The body nodes are positioned directly
  // each frame (no Verlet), but the deformation profile changes by movement
  // style so creatures visibly differ in how they swim:
  //   • fin     → smooth gliding with restrained rear steering
  //   • pulse   → squid/jelly-like contraction bursts
  //   • wriggle → flexible tail/body undulation
  _swimBodyWave(visual, dt, heading, speed, turnRate, cx, cy) {
    visual.heading  = heading;
    visual.turnRate = turnRate;
    visual.facing.x = Math.cos(heading);
    visual.facing.y = Math.sin(heading);

    const fx = visual.facing.x;
    const fy = visual.facing.y;

    const body = visual.body;
    const N    = body.nodes.length;
    const elong = visual.genome.body.elongation || 1.0;
    const style = (visual.genome && visual.genome.movement && visual.genome.movement.style) || 'wriggle';
    const swimTuning = this.softSwimTuning || SoftSwimTuning;

    // Smoothly track source radius so growth doesn't snap visually.
    const R = visual._smoothR || visual.genome.body.baseRadius || 20;
    visual._smoothR = R + ((visual._targetR || R) - R) * Math.min(1, dt * 5.5);

    const normalSpeed = Math.min(1, speed / 100);
    const motionPhase = (visual.motionPhase || 0) * TAU;
    const bend = Math.max(-2.2, Math.min(2.2, turnRate || 0));
    // Larger bodies should animate at a slower stroke cadence.
    const sizeFreqScale = clamp(1.12 - (visual._smoothR || 20) / 72, 0.46, 1.0);

    let halfFwd = visual._smoothR * elong;
    let halfLat = visual._smoothR;
    let pulseKick = 0;
    let pulseRecover = 0;
    let pulseFreq = 0;
    let wriggleFreq = 0;
    let wriggleAmp = 0;
    let finFreq = 0;

    if (style === 'pulse') {
      pulseFreq = (swimTuning.pulseFreqBase + normalSpeed * swimTuning.pulseFreqSpeed) * sizeFreqScale;
      const pulsePhase = visual.time * pulseFreq * TAU + motionPhase;
      const pulseWave = Math.sin(pulsePhase);
      pulseKick = Math.max(0, pulseWave);
      pulseRecover = Math.max(0, -pulseWave);
      halfFwd *= 1 + pulseKick * swimTuning.pulseContractFwd - pulseRecover * 0.05;
      halfLat *= 1 - pulseKick * 0.10 + pulseRecover * 0.06;
    } else if (style === 'fin') {
      finFreq = (swimTuning.finFreqBase + normalSpeed * swimTuning.finFreqSpeed) * sizeFreqScale;
      const glidePhase = visual.time * finFreq * TAU + motionPhase;
      halfFwd *= 1 + normalSpeed * 0.04 + Math.sin(glidePhase) * 0.012;
      halfLat *= 1 - normalSpeed * 0.02 + Math.sin(glidePhase + HALF_PI) * 0.008;
    } else {
      wriggleFreq = (swimTuning.wriggleFreqBase + normalSpeed * swimTuning.wriggleFreqSpeed) * sizeFreqScale;
      wriggleAmp = visual._smoothR * (swimTuning.wriggleAmpBase + normalSpeed * swimTuning.wriggleAmpSpeed);
      const wrigglePhase = visual.time * wriggleFreq * TAU + motionPhase;
      halfFwd *= 1 + Math.sin(wrigglePhase) * 0.012;
      halfLat *= 1 + Math.sin(wrigglePhase + HALF_PI) * 0.008;
    }

    for (let i = 0; i < N; i++) {
      const angle = (i / N) * TAU;

      // Rest position on ellipse in body-local space.
      // angle = 0  → front of body (head, in facing direction)
      // angle = π  → rear  of body (tail, opposite facing)
      const localFwd = Math.cos(angle) * halfFwd;   // + = front
      const localLat = Math.sin(angle) * halfLat;   // lateral rest offset

      // Normalized body position: 0 = head, 1 = tail.
      const bodyPos = (halfFwd - localFwd) / Math.max(1, 2 * halfFwd);

      const rearT    = Math.max(0, (bodyPos - 0.35) / 0.65);
      const headT    = 1 - bodyPos;
      let styleLat = 0;
      let localFwdAdj = localFwd;

      if (style === 'fin') {
        const finPhaseLocal = visual.time * finFreq * TAU + motionPhase;
        const bodyRoll = Math.sin(finPhaseLocal + angle * 0.7) * visual._smoothR * 0.004;
        const rearSweep = Math.sin(finPhaseLocal - bodyPos * 1.7) * visual._smoothR * (swimTuning.finRearSweepBase + normalSpeed * swimTuning.finRearSweepSpeed) * Math.pow(rearT, 1.45);
        const bendDisp = bend * visual._smoothR * swimTuning.finBend * rearT * rearT;
        const glideLift = Math.sin(finPhaseLocal + HALF_PI) * visual._smoothR * 0.006 * headT;
        styleLat = bodyRoll + rearSweep + bendDisp + glideLift;
        localFwdAdj = localFwd + Math.sin(finPhaseLocal) * visual._smoothR * swimTuning.finForwardSweep * (0.20 + headT * 0.18);
      } else if (style === 'pulse') {
        const jetBias = pulseKick * pulseKick;
        const rimPulse = Math.sin(angle * 2 + motionPhase) * visual._smoothR * (0.006 + pulseKick * 0.008);
        const rearJet = Math.sin(angle) * visual._smoothR * swimTuning.pulseRearJet * jetBias * (0.35 + rearT * 0.5);
        const bendDisp = bend * visual._smoothR * 0.007 * rearT;
        const idleDrift = (1 - normalSpeed) * Math.sin(visual.time * 2.1 + angle * 1.4) * visual._smoothR * 0.004;
        styleLat = rimPulse + rearJet + bendDisp + idleDrift;
        localFwdAdj = localFwd - (pulseKick - pulseRecover * 0.35) * visual._smoothR * swimTuning.pulseForwardJet * (bodyPos - 0.5) * (0.55 + headT * 0.15);
      } else {
        const wavePhase = bodyPos * TAU * swimTuning.wriggleTravel - visual.time * wriggleFreq * TAU + motionPhase;
        const waveDisp = Math.sin(wavePhase) * wriggleAmp * Math.pow(rearT, 0.9);
        const bendDisp = bend * visual._smoothR * swimTuning.wriggleBend * rearT * rearT;
        const idleWobble = (1 - normalSpeed) * Math.sin(visual.time * 2.6 + angle * 2.0) * visual._smoothR * 0.004;
        styleLat = waveDisp + bendDisp + idleWobble;
        localFwdAdj = localFwd + Math.sin(wavePhase + HALF_PI) * visual._smoothR * swimTuning.wriggleForward * rearT;
      }

      const totalLat = localLat + styleLat;

      // Rotate body-local coords by heading into world space.
      // forward basis: (fx, fy)   lateral-left basis: (lx, ly) = (-fy, fx)
      body.nodes[i].x    = cx + localFwdAdj * fx - totalLat * fy;
      body.nodes[i].y    = cy + localFwdAdj * fy + totalLat * fx;
      // Zero velocity — kinematic positions are authoritative, no Verlet needed.
      body.nodes[i].prevX = body.nodes[i].x;
      body.nodes[i].prevY = body.nodes[i].y;
      body.nodes[i].vx   = 0;
      body.nodes[i].vy   = 0;
    }
    // No physics step — positions are computed analytically.
  }

  syncSoftCreatureVisual(visual, dt) {
    const source = visual.sourceCreature;
    if (!source || source.dead) return;

    visual.time        += dt;
    visual.isLegendary  = !!source.legendary;
    visual.label        = source.legendary ? source.name : '';
    visual.behavior     = source.state || source.behavior;
    visual.mood         = source.dead ? 'injured' : source.scared > 0.65 ? 'afraid' : source.angry > 0.6 ? 'aggressive' : source.hunger > 0.6 ? 'hungry' : 'calm';
    visual.growthLevel  = source.growthLevel || 0;
    visual.hitFlash     = source.hitFlash    || 0;
    visual.growthPulse  = source.growthPulse || 0;
    visual.eatenMark    = source.eatenMark   || 0;
    visual._targetR     = source.r;
    visual.genome.movement.style = this._resolveSoftMovementStyle(source, visual.genome.movement.style);

    const speed = Math.hypot(source.vx || 0, source.vy || 0);
    const tracked = this._advanceVisualHeading(visual, dt, source.angle, speed);

    for (let i = 0; i < visual.parts.length; i++) window.DriftCreatures.updateCreaturePart(visual.parts[i], dt);
    this._swimBodyWave(visual, dt, tracked.heading, speed, tracked.turnRate, source.x, source.y);
  }


  updateSoftCreatures(dt) {
    if (!this.softCreaturesEnabled()) return;

    this.ensureSoftCreatures();
    this.ensureSoftPlayerCreature();

    for (let i = 0; i < this.softCreatures.length; i++) {
      this.syncSoftCreatureVisual(this.softCreatures[i], dt);
    }
    this.syncSoftPlayerVisual(dt);
    // No post-sync re-pin needed — _swimBodyWave sets node positions kinematically
    // from source.x/y directly, so body center is already correct.

    // Compute action-range flags so exclamation markers appear in the main game.
    if (this.player && !this.player.dead && this.softPlayer) {
      const D = window.DriftCreatures;
      const pCenter = D.getBodyCenter(this.softPlayer.body);
      const pSize = this.player.r;
      const spaceR = pSize * 2.5 + 45;
      const eR     = pSize * 3.5 + 65;
      const qR     = pSize * 4.5 + 80;
      for (let i = 0; i < this.softCreatures.length; i++) {
        const visual = this.softCreatures[i];
        if (!visual.sourceCreature || visual.sourceCreature.dead) { visual._actionFlags = null; continue; }
        const oc   = D.getBodyCenter(visual.body);
        const dist = Math.hypot(oc.x - pCenter.x, oc.y - pCenter.y);
        const af = { space: dist < spaceR, e: dist < eR, q: dist < qR };
        visual._actionFlags = (af.space || af.e || af.q) ? af : null;
      }
    } else {
      for (let i = 0; i < this.softCreatures.length; i++) {
        this.softCreatures[i]._actionFlags = null;
      }
    }
  }

  drawSoftCreatures(ctx, w, h) {
    if (!this.softCreaturesEnabled()) return;

    const visibleR = this.getRenderRadius() + 260;
    const visibleSq = visibleR * visibleR;
    const debug = window.DriftCreatures && window.DriftCreatures.debug;
    ctx.save();
    ctx.translate(-this.camX + w * 0.5, -this.camY + h * 0.5);
    for (let i = 0; i < this.softCreatures.length; i++) {
      const creature = this.softCreatures[i];
      const center = window.DriftCreatures.getBodyCenter(creature.body);
      const dx = center.x - this.camX;
      const dy = center.y - this.camY;
      if (dx * dx + dy * dy > visibleSq) continue;
      creature.render(ctx);
      if (debug && (debug.creaturePhysics || debug.creatureConstraints || debug.creatureAI || debug.creatureGrowth)) {
        window.DriftCreatures.renderCreatureDebug(ctx, creature);
      }
    }
    ctx.restore();
  }

  generateRockRing(ring) {
    if (this.generatedRockRings.has(ring)) return;
    this.generatedRockRings.add(ring);

    const countBase = ring <= 3 ? 4 + ring : 6 + Math.floor(ring * 0.52);
    const count = clamp(countBase, 6, 28);
    const inner = Math.max(220, (ring - 1) * RING_SIZE + 30);
    const outer = ring * RING_SIZE + 30;

    for (let i = 0; i < count; i++) {
      const seed = hashStringSeed(`${this.seedString}:rock:${ring}:${i}`);
      const rrng = rngFromSeed(seed);
      const a = (i / count) * TAU + (rrng() - 0.5) * (TAU / count) * 0.9;
      const d = inner + rrng() * (outer - inner);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;

      // Keep a guaranteed safe region around the start area.
      const originSafeR = ring <= 2 ? 820 : ring <= 4 ? 640 : 300;
      if (Math.hypot(x, y) < originSafeR) continue;

      const rock = new Rock(x, y, rrng, ring);
      if (Math.hypot(rock.x, rock.y) < rock.maxR + T.PLAYER_START_SIZE + 180) continue;
      this.rocks.push(rock);
    }
  }

  ensureProceduralWorld() {
    if (!this.player) return;
    const centerRing = this.getRingIndexAt(this.player.x, this.player.y);
    const minRing = Math.max(1, centerRing - 5);
    const maxRing = centerRing + 14;
    for (let ring = minRing; ring <= maxRing; ring++) {
      this.generateRockRing(ring);
    }
  }

  startFromIntro() {
    const txt = (this.ui.el.seedInput.value || '').trim();
    let seedStr = txt;
    if (!seedStr || seedStr === 'random') seedStr = shortSeedString(Math.floor(Math.random() * 0xFFFFFFFF));
    this.seedString = seedStr;
    this.seed = hashStringSeed(seedStr);
    this.ui.setSeed(seedStr);
    this.creatorData = window.CREATOR ? Object.assign({}, window.CREATOR) : null;
    this.ui.el.intro.classList.remove('show');
    if (CFG.audioEnabled) { Audio.enable(); this.ui.setAudioLabel(true); }
    else this.ui.setAudioLabel(false);
    this.startGame();
  }

  restart() {
    this.ui.hideGameOver();
    this.seedString = shortSeedString(Math.floor(Math.random() * 0xFFFFFFFF));
    this.seed = hashStringSeed(this.seedString);
    this.ui.setSeed(this.seedString);
    this.startGame();
  }

  applyCreatorData(p) {
    const d = this.creatorData;
    if (!d) return;
    // body shape: stored for draw overrides; Player.draw uses this.creatorBody
    p.creatorBody = d.body || 'round';
    p.creatorHue  = d.hue  || 195;
    // diet
    if (d.diet === 'carnivore') {
      p.diet = 'carnivore';
      p.herbivoreRegen = false;
    } else {
      p.diet = 'herbivore';
      p.herbivoreRegen = true;
    }
    p.speciesTag = `${p.creatorBody}:${p.diet}`;
    p.discoveredParts = new Set(['tail', 'fin', 'cilia']);
    if (p.diet === 'carnivore') p.discoveredParts.add('mandible');
    else if (p.diet === 'herbivore') p.discoveredParts.add('filtermouth');
    else {
      p.discoveredParts.add('mandible');
      p.discoveredParts.add('filtermouth');
    }
    p.omnivoreUnlocked = false;
    // starting trait
    const traitMutId = { fins: 'fins', eyes: 'eyes', armor: 'armor', metabolism: 'metabolism' }[d.trait];
    if (traitMutId) {
      const m = MUTATION_BY_ID[traitMutId];
      if (m) p.applyMutation(m);
    }

    const build = d.build || 'balanced';
    if (build === 'swift') {
      p.stats.speedMul *= 1.15;
      p.stats.accelMul *= 1.18;
      p.stats.defense = Math.max(0, p.stats.defense - 10);
    } else if (build === 'armored') {
      p.stats.defense += 22;
      p.stats.hpMax += 18;
      p.hp = Math.min(p.stats.hpMax, p.hp + 18);
      p.stats.speedMul *= 0.9;
    } else if (build === 'efficient') {
      p.stats.metabMul *= 0.82;
      p.stats.healMul *= 1.1;
      p.stats.biteMul *= 0.9;
    }
    }

  startGame() {
    this.rng = rngFromSeed(this.seed);
    this.creatures.length = 0;
    this.softCreatures.length = 0;
    this.softCreatureLookup.clear();
    this.foods.length = 0;
    this.partShards.length = 0;
    this.hazards.length = 0;
    this.plants.length = 0;
    this.eggs.length = 0;
    this.particles = new ParticlePool(this.isMobile ? 420 : 700);
    this.player = new Player(0, 0);
    this.applyCreatorData(this.player);
    this.camX = 0; this.camY = 0;
    this.zoom = this.isMobile ? 0.9 : 1.0;
    this.lastT = performance.now();
    this.running = true;
    this.paused = false;
    this.gameOver = false;
    this.director = new Director(this, this.rng);
    this.lastBiomeId = null;
    this.codexRecent = '';
    this.goals = new GoalSet(this.rng, BIOMES[0]);
    this.ui.setGoals(this.goals);
    this.ui.showBiome(BIOMES[0]);

    // Generate procedural rings around spawn and guarantee a safe start position.
    this.rocks.length = 0;
    this.generatedRockRings.clear();
    for (let ring = 1; ring <= 14; ring++) {
      this.generateRockRing(ring);
    }
    this.ensureProceduralWorld();

    const safeStart = this.findSafeSpawnPointWithEscape(0, 0, 320, 46, 16, 0, 680);
    if (safeStart) {
      this.player.x = safeStart.x;
      this.player.y = safeStart.y;
      this.camX = safeStart.x;
      this.camY = safeStart.y;
      this.clearSpawnTrapRocks(safeStart.x, safeStart.y, 620, 2000, 220);
    }

    // seed initial world: food and gentle starting creatures
    for (let i = 0; i < 14; i++) this.director.spawnCreatureNear(this.player, 0);

    // Seed loose plant chunks so clusters can form organically into PlantStructures.
    for (let i = 0; i < 22; i++) {
      const a = this.rng() * TAU;
      const d = 480 + this.rng() * 1300;
      const f = this.spawnFood(
        this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d,
        'plant', null, 3 + this.rng() * 1.5
      );
      if (f) { f.vx = (this.rng() - 0.5) * 14; f.vy = (this.rng() - 0.5) * 14; }
    }

    this.rebuildSoftCreatures();

    // Seed 3 bootstrap PlantStructures so plant ecology is present from the start.
    for (let i = 0; i < 3; i++) {
      const a = this.rng() * TAU;
      const d = 700 + this.rng() * 900;
      const safe = this.findSafeSpawnPoint(
        this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 140, 12, 14, 520
      );
      if (safe) {
        this.plants.push(new PlantStructure(safe.x, safe.y, this.rng,
          clamp(this.getOutwardScaleAt(safe.x, safe.y), 1, 10)));
      }
    }
    // Hazard plants (spine_weed, curl_weed) spawn via the Director naturally — no startup seeding.

    // Action slots: what each action key does (rebindable via action menu)
    this.actionSlots = { s1: 'bite', s2: 'inspect', s3: 'surge' };
    this.showingActionMenu = false;

    if (!this._loopBound) {
      this._loopBound = (t) => this.loop(t);
      requestAnimationFrame(this._loopBound);
    }
  }

  setPaused(p) {
    this.paused = p;
    this.ui.showPause(p);
    if (!p) this.ui.showPauseSettings(false);
    // Close action menu when pausing
    if (p && this.showingActionMenu) this.toggleActionMenu();
  }

  toggleActionMenu() {
    this.showingActionMenu = !this.showingActionMenu;
    const el = document.getElementById('action-menu');
    if (!el) return;
    if (this.showingActionMenu) {
      this.refreshActionMenu();
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }

  refreshActionMenu() {
    const p = this.player;
    if (!p) return;
    // Build available action list based on player's unlocked mutations/parts.
    const available = [
      { id: 'bite',    label: 'Bite',     desc: 'Lunge forward for a quick bite attack.', icon: '🦷', always: true },
      { id: 'inspect', label: 'Inspect',  desc: 'Read out the nearest creature.',         icon: '🔍', always: true },
      { id: 'surge',   label: 'Surge',    desc: 'Brief speed boost.',                     icon: '⚡', always: true },
    ];
    if ((p.mutations || []).some(m => m.icon === 'fang' || m.icon === 'mandibles' || m.icon === 'venom')) {
      available.push({ id: 'strike', label: 'Strike', desc: 'Weapon attack with enhanced damage.', icon: '⚔️' });
    }
    if ((p.mutations || []).some(m => m.icon === 'plates' || m.icon === 'shell')) {
      available.push({ id: 'shield', label: 'Shield', desc: 'Brace — deflect incoming damage briefly.', icon: '🛡️' });
    }

    // Render palette
    const palette = document.getElementById('action-palette');
    if (palette) {
      palette.innerHTML = '';
      for (const a of available) {
        const card = document.createElement('div');
        card.className = 'action-card';
        card.draggable = true;
        card.dataset.action = a.id;
        card.title = a.desc;
        card.innerHTML = `<span class="action-icon">${a.icon}</span><span class="action-label">${a.label}</span>`;
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', a.id); });
        card.addEventListener('click', () => {
          document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          this._pendingActionBind = a.id;
        });
        palette.appendChild(card);
      }
    }

    // Update slot display labels
    const slots = ['s1', 's2', 's3'];
    for (const slot of slots) {
      const el = document.getElementById(`slot-${slot}-name`);
      const keyEl = document.getElementById(`slot-${slot}-key`);
      if (el) {
        const actionId = this.actionSlots[slot];
        const action = available.find(a => a.id === actionId);
        el.textContent = action ? `${action.icon} ${action.label}` : '—';
      }
      if (keyEl) {
        const actionKey = { s1: 'slot1', s2: 'slot2', s3: 'slot3' }[slot];
        keyEl.textContent = `[ ${Controls.labelFor(actionKey)} ]`;
      }
    }

    // Drop target event listeners
    document.querySelectorAll('.action-slot-target').forEach(target => {
      target.ondragover = (e) => { e.preventDefault(); target.classList.add('drag-over'); };
      target.ondragleave = () => target.classList.remove('drag-over');
      target.ondrop = (e) => {
        e.preventDefault();
        target.classList.remove('drag-over');
        const actionId = e.dataTransfer.getData('text/plain');
        const slot = target.dataset.slot;
        if (actionId && slot && this.actionSlots[slot] !== undefined) {
          this.actionSlots[slot] = actionId;
          this.refreshActionMenu();
        }
      };
      target.addEventListener('click', () => {
        if (this._pendingActionBind) {
          const slot = target.dataset.slot;
          if (slot && this.actionSlots[slot] !== undefined) {
            this.actionSlots[slot] = this._pendingActionBind;
            this._pendingActionBind = null;
            document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));
            this.refreshActionMenu();
          }
        }
      });
    });
  }

  triggerActionSlot(slot) {
    const p = this.player;
    if (!p || p.dead) return;
    const action = this.actionSlots[slot];
    if (!action) return;

    if (action === 'bite') {
      // Lunge toward nearest enemy in a cone
      if (p.dashCD <= 0 && p.energy >= T.DASH_ENERGY * 0.6 * (p.stats.dashCostMul || 1)) {
        const aim = Input.aimDir(this.canvas);
        p.vx += aim[0] * T.DASH_FORCE * 0.75;
        p.vy += aim[1] * T.DASH_FORCE * 0.75;
        p.dashTimer = T.DASH_DURATION * 0.55;
        p.dashCD = T.DASH_COOLDOWN * 0.8;
        p.energy -= T.DASH_ENERGY * 0.6 * (p.stats.dashCostMul || 1);
        p.bumpBiteCD = 0; // allow immediate bite on contact
        this.particles.burst(p.x, p.y, 8, { speed: 160, life: 0.35, r: 2, h: 8, s: 80, l: 70 });
        Audio.dash && Audio.dash();
      }
    } else if (action === 'inspect') {
      // Show name and state of nearest creature
      let nearest = null, nearD2 = Infinity;
      for (let i = 0; i < this.creatures.length; i++) {
        const c = this.creatures[i];
        if (!c || c.dead) continue;
        const d2 = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
        if (d2 < nearD2) { nearD2 = d2; nearest = c; }
      }
      if (nearest) {
        const dist = Math.round(Math.sqrt(nearD2));
        const state = nearest.state || nearest.behavior || '?';
        this.ui.toast(`${nearest.name || nearest.kind || 'Creature'} · ${state} · ${dist}u`);
      } else {
        this.ui.toast('Nothing nearby.');
      }
    } else if (action === 'surge') {
      // Brief speed boost without full dash cost
      if (p.energy >= 12) {
        const m = Math.hypot(p.vx, p.vy) || 1;
        p.vx = (p.vx / m) * Math.min(p.speed * 2.0, Math.hypot(p.vx, p.vy) + p.speed * 0.8);
        p.vy = (p.vy / m) * Math.min(p.speed * 2.0, Math.hypot(p.vx, p.vy) + p.speed * 0.8);
        p.energy -= 12;
        this.particles.burst(p.x, p.y, 6, { speed: 100, life: 0.28, r: 1.5, h: 190, s: 70, l: 80 });
      }
    } else if (action === 'strike') {
      // Enhanced weapon attack — higher damage lunge
      if (p.dashCD <= 0 && p.energy >= T.DASH_ENERGY * (p.stats.dashCostMul || 1)) {
        const aim = Input.aimDir(this.canvas);
        p.vx += aim[0] * T.DASH_FORCE * 1.1;
        p.vy += aim[1] * T.DASH_FORCE * 1.1;
        p.dashTimer = T.DASH_DURATION;
        p.dashCD = T.DASH_COOLDOWN * 1.2;
        p.energy -= T.DASH_ENERGY * (p.stats.dashCostMul || 1);
        p.bumpBiteCD = 0;
        p._strikeBonus = 1.6; // multiplier applied in next bite collision
        this.particles.burst(p.x, p.y, 12, { speed: 240, life: 0.45, r: 2.5, h: 0, s: 80, l: 65 });
        Audio.dash && Audio.dash();
      }
    } else if (action === 'shield') {
      // Brief defense boost
      if (p.energy >= 10) {
        p._shieldTimer = Math.max(p._shieldTimer || 0, 1.2);
        p.energy -= 10;
        this.particles.burst(p.x, p.y, 10, { speed: 80, life: 0.4, r: 2, h: 220, s: 60, l: 75 });
      }
    }
  }

  quitToMenu() {
    this.running = false;
    this.paused = false;
    this.ui.showPause(false);
    this.ui.showPauseSettings(false);
    this.ui.hideGameOver();
    this.ui.el.intro.classList.add('show');
    this.ui.toast('Returned To Menu');
  }

  quitToDesktop() {
    try {
      window.close();
    } catch (e) {
      // ignore and fallback
    }
    setTimeout(() => {
      window.location.href = 'home.html';
    }, 40);
  }

  loop(t) {
    requestAnimationFrame(this._loopBound);
    if (!this.running) return;
    const dt = Math.min(T.DT_MAX, (t - this.lastT) / 1000);
    this.lastT = t;
    Input.tick();
    if (Input.pauseEdge && !this.gameOver && !this.mutationActive) this.setPaused(!this.paused);
    if (Input.actionMenuEdge && !this.gameOver && !this.mutationActive && !this.paused) this.toggleActionMenu();
    if (Input.scrollDelta !== 0) {
      this.zoom = clamp(this.zoom * (1 - Input.scrollDelta * 0.0008), 0.3, 2.5);
      Input.scrollDelta = 0;
    }
    if (this.paused || this.mutationActive || this.milestoneActive) { this.draw(); return; }
    if (this.gameOver) { this.draw(); return; }
    // Action slot triggers
    if (!this.showingActionMenu) {
      if (Input.actionEdge.s1) this.triggerActionSlot('s1');
      if (Input.actionEdge.s2) this.triggerActionSlot('s2');
      if (Input.actionEdge.s3) this.triggerActionSlot('s3');
    }

    this.update(dt);
    this.draw();
  }

  update(dt) {
    const p = this.player;
    p.update(dt, this);
    this.ensureProceduralWorld();
    if (this.isInsideRock(p.x, p.y, p.r + 4) || !this.hasEscapeRoute(p.x, p.y, p.r + 4, 620)) {
      const rescue = this.findSafeSpawnPointWithEscape(p.x, p.y, 320, 34, p.r + 14, 0, 700);
      if (rescue) {
        p.x = rescue.x;
        p.y = rescue.y;
        p.vx *= 0.35;
        p.vy *= 0.35;
      }
    }
    const current = this.getCurrentVectorAt(this.camX, this.camY);

    // camera
    this.camX += (p.x - this.camX) * Math.min(1, T.CAMERA_LERP * 60 * dt);
    this.camY += (p.y - this.camY) * Math.min(1, T.CAMERA_LERP * 60 * dt);

    // rebuild spatial grid
    this.grid.clear();
    for (let i = 0; i < this.creatures.length; i++) this.grid.insert(this.creatures[i]);
    for (let i = 0; i < this.foods.length; i++) this.grid.insert(this.foods[i]);

    // distance-based simplified updates
    const activeRadius = this.getActiveRadius();
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i];
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      c.distantUpdate = d > activeRadius && !c.legendary;
    }

    // creatures
    for (let i = 0; i < this.creatures.length; i++) this.creatures[i].update(dt, this);

    // Creature wake — fast-moving creatures push nearby drifting objects like a speedboat wake.
    const wakeRadius = 110;
    const wakeRadSq = wakeRadius * wakeRadius;
    const wakers = [p, ...this.creatures];
    for (const mover of wakers) {
      const spd = Math.hypot(mover.vx, mover.vy);
      if (spd < 28) continue; // only noticeable at speed
      const wakeStr = clamp((spd - 28) * 0.012, 0, 0.9);
      const near = this.grid.query(mover.x, mover.y, wakeRadius, this._scratch);
      for (let j = 0; j < near.length; j++) {
        const o = near[j];
        if (!o || o.kind !== 'food' || o.dead) continue;
        const odx = o.x - mover.x, ody = o.y - mover.y;
        const d2 = odx * odx + ody * ody;
        if (d2 < 4 || d2 > wakeRadSq) continue;
        const d = Math.sqrt(d2);
        const falloff = 1 - d / wakeRadius;
        // Wake is strongest perpendicular to travel direction and slightly behind
        const nx = odx / d, ny = ody / d;
        const push = wakeStr * falloff * 22;
        o.vx += nx * push * dt;
        o.vy += ny * push * dt;
      }
    }

    // physical separation to avoid overlap jitter and improve body collisions.
    this.resolveCreatureBodyCollisions();

    // Same-species NPC reproduction. Cheap throttled scan; spawns offspring
    // matching the parents' template/species.
    this.updateNpcMating(dt);

    // foods drift
    for (let i = 0; i < this.foods.length; i++) this.foods[i].update(dt);
    // Plant chunks do not attract or link to each other — they drift freely.
    // this.resolvePlantFoodChains(dt);

    // soft-creature visual replacement layer, behind feature flag
    this.updateSoftCreatures(dt);

    // part shards drift and collect
    for (let i = 0; i < this.partShards.length; i++) {
      const shard = this.partShards[i];
      shard.update(dt);
      if (!shard.dead && Math.hypot(shard.x - p.x, shard.y - p.y) < p.r + shard.r + 4) {
        this.collectPartShard(shard);
      }
    }

    // creature feeding on meat and plants
    this.updateCreatureFeeding(dt);

    // plant clusters — update, herbivore passive eat
    const plantBins = 10;
    const binUse = new Array(plantBins).fill(0);
    const perBinCap = Math.max(2, Math.floor(this.plants.length * 0.26));
    const baseMag = Math.hypot(current.x, current.y) || 1;
    const tFlow = performance.now() * 0.001;
    const plantEntities = [...this.creatures, this.player];
    // Loose plant chunks also interact physically with other plants (drag on
    // leaves, hard collision on branch segments + uneaten nodes). Skip chunks
    // emitted by the plant being updated — those should pass through freely.
    for (let i = 0; i < this.foods.length; i++) {
      const f = this.foods[i];
      if (f && !f.dead && f.type === 'plant') plantEntities.push(f);
    }
    for (let i = 0; i < this.plants.length; i++) {
      const pl = this.plants[i];
      const phase = (pl.flowPhase || 0) + dt * (0.35 + (pl.flowDrift || 0.8) * 0.4);
      pl.flowPhase = phase;
      const localA = this.getCurrentVectorAt(pl.x, pl.y);
      const localAng = Math.atan2(localA.y, localA.x);
      let driftAng = localAng + Math.sin(phase + tFlow * 0.45 + i * 0.37) * 0.75 + Math.sin((pl.flowBias || 0) + tFlow * 0.27) * 0.38;
      let bucket = ((Math.floor(((driftAng + TAU) % TAU) / TAU * plantBins) % plantBins) + plantBins) % plantBins;
      if (binUse[bucket] >= perBinCap) {
        let chosen = bucket;
        for (let step = 1; step < plantBins; step++) {
          const cw = (bucket + step) % plantBins;
          const ccw = (bucket - step + plantBins) % plantBins;
          if (binUse[cw] < perBinCap) { chosen = cw; break; }
          if (binUse[ccw] < perBinCap) { chosen = ccw; break; }
        }
        bucket = chosen;
        driftAng = ((bucket + 0.5) / plantBins) * TAU;
      }
      binUse[bucket]++;
      const driftMag = baseMag * (1.18 + 0.38 * Math.sin(phase * 1.6 + i * 0.19));
      const driftVec = { x: Math.cos(driftAng) * driftMag, y: Math.sin(driftAng) * driftMag };
      pl.update(dt, plantEntities, this, driftVec);
      if (this.player.diet === 'herbivore' || this.player.diet === 'omnivore') {
        const minPlantChunk = clamp(this.player.r * 0.16, 1.4, 12);
        const gain = pl.eatFrom(this.player.x, this.player.y, this.player.r, this, minPlantChunk, this.player.vx, this.player.vy, this.player.growthLevel || 0);
        if (gain > 0) {
          const eff = this.player.diet === 'herbivore' ? 3.0 : 1.0;
          this.player.energy = Math.min(this.player.stats.energyMax, this.player.energy + gain * eff * dt * 4);
          this.player.foodMilestonePoints += gain * eff * dt * 0.42;
          this.grantDNA(gain * eff * dt * 0.11);
          if (this.player.herbivoreRegen) this.player.hp = Math.min(this.player.stats.hpMax, this.player.hp + 0.5 * dt);
        }
      }
    }
    this.plants = this.plants.filter(pl => !pl.dead);
    this.updatePlantLinking(dt);

    // hazards
    for (let i = 0; i < this.hazards.length; i++) {
      const hz = this.hazards[i];
      hz.update(dt);
      this.emitHazardPlantFood(hz, dt);
      hz.affect(p, dt, this);
      // also affect creatures
      const nearby = this.grid.query(hz.x, hz.y, hz.r + 30, this._scratch);
      for (let j = 0; j < nearby.length; j++) {
        const e = nearby[j];
        if (e.kind === 'creature' && !e.dead) hz.affect(e, dt, this);
      }
    }

    // mating system
    this.updateMating(dt);

    // eggs
    for (const egg of this.eggs) egg.update(dt);

    // Rock water-drag and attachment-aware drift.
    for (const rock of this.rocks) {
      const flow = this.getCurrentVectorAt(rock.x, rock.y);
      const hasAttachedPlant = !!(rock._connectedPlant && !rock._connectedPlant.dead);
      rock.update(dt, flow, hasAttachedPlant);
    }
    this.resolveRockStickCollisions(dt);

    // rock collision — push all entities + plant branch segments (multi-pass)
    for (let pass = 0; pass < 2; pass++) {
      for (const rock of this.rocks) {
        rock.pushOut(p);
        const nearby = this.grid.query(rock.x, rock.y, rock.maxR + 260, this._scratch);
        for (const e of nearby) {
          if (e.kind === 'creature' && !e.dead) rock.pushOut(e);
        }
        // Push plant branch segments out of rocks
        for (const pl of this.plants) {
          const pdx = pl.x - rock.x, pdy = pl.y - rock.y;
          if (pdx * pdx + pdy * pdy > (rock.maxR + 200) * (rock.maxR + 200)) continue;
          for (const branch of pl.branches) {
            for (const seg of branch.segments) {
              const sdx = seg.x - rock.x, sdy = seg.y - rock.y;
              const sd = Math.hypot(sdx, sdy) || 0.001;
              if (sd > rock.maxR + 8) continue;
              const surfR = rock._effectiveRadiusForCircle(Math.atan2(sdy, sdx), sd, 6);
              const ov = surfR + 6 - sd;
              if (ov > 0) {
                seg.x += (sdx / sd) * ov;
                seg.y += (sdy / sd) * ov;
                seg.vx = seg.vx * 0.5 + rock.vx * 0.5;
                seg.vy = seg.vy * 0.5 + rock.vy * 0.5;
              }
            }
          }
        }
      }
    }

    // collisions: player eats food, attacks creatures, gets attacked is in creature.act
    if (!p.hatching) this.resolvePlayerCollisions();

    // remove dead/expired
    this.foods = this.foods.filter(f => !f.dead);
    this.partShards = this.partShards.filter(s => !s.dead);
    this.hazards = this.hazards.filter(h => !h.dead);
    this.creatures = this.creatures.filter(c => !(c.dead && c.deathT > 240));

    // despawn very distant
    const despawnR = Math.max(T.DESPAWN_RADIUS, this.getActiveRadius() + 1300);
    const despawnSq = despawnR * despawnR;
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      const dx = c.x - p.x, dy = c.y - p.y;
      if ((dx*dx + dy*dy) > despawnSq && !c.legendary) this.creatures.splice(i, 1);
    }
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      const dx = f.x - p.x, dy = f.y - p.y;
      if ((dx*dx + dy*dy) > despawnSq) this.foods.splice(i, 1);
    }

    // particles
    this.particles.update(dt);

    // director
    this.director.update(dt, p);
    this.lastBiomeId = biomeAt(Math.hypot(p.x, p.y)).id;

    // Major milestone: omnivore requires both depth progression and enough consumed food progress.
    if (!p.omnivoreMilestoneReached && p.deepestRadius >= BIOME_VENT_INNER && p.foodMilestonePoints >= 24) {
      p.omnivoreMilestoneReached = true;
      this.offerOmnivoreMilestone(false);
    }

    // If deferred, offer a second chance deeper in the abyss with higher food progress.
    if (p.omnivoreDeferred && !p.omnivoreUnlocked && !p.omnivoreAbyssPrompted && p.deepestRadius >= BIOME_ABYSS_INNER && p.foodMilestonePoints >= 40) {
      p.omnivoreAbyssPrompted = true;
      this.offerOmnivoreMilestone(true);
    }

    // goals
    this.goals.update(p, this);

    // UI
    this.ui.setStats(p);
    this.ui.setTime(p.totalTime);
    this.ui.setCodex(p.discoveredParts || new Set(), this.codexRecent || '');
    this.ui.updateGoalProgress(this.goals, p, this);
    this.ui.updateOverlays(dt);

    // predator warning
    const warn = this.detectThreat(p);
    this.ui.setWarn(warn);

    // death
    if (p.dead && !this.gameOver) this.endGame();

    // Mutation choices require both food points and a same-species mating unlock token.
    if (p.mutationUnlockTokens > 0 && p.dna >= T.DNA_PER_MUTATION && !this.mutationActive && !this.milestoneActive) {
      this.offerMutation();
    }
  }

  detectThreat(p) {
    const senseR = (p.detection || 220) * (p.predatorSense || 1);
    const near = this.grid.query(p.x, p.y, senseR, this._scratch);
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (c.kind !== 'creature' || c.dead) continue;
      if (c.r > p.r * 1.05 && Math.hypot(c.x - p.x, c.y - p.y) < senseR) return true;
    }
    return false;
  }

  resolvePlayerCollisions() {
    const p = this.player;
    if (p.eatTimer > 0) return; // mid-consume, skip new hits
    const list = this.grid.query(p.x, p.y, p.r + 30, this._scratch);
    let handledCreatureBounce = false;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (e.kind === 'food' && !e.dead) {
        if (d < p.r + e.r) {
          // diet gate for meat
          if (e.type === 'meat' && p.diet === 'herbivore') continue;
          // growth gate for loose plant chunks (ejected from plant nodes).
          if (e.type === 'plant') {
            const G = window.GROWTH_THRESHOLDS || {};
            const minG = (G.plantChunkEat != null) ? G.plantChunkEat : 7;
            if ((p.growthLevel || 0) < minG) continue;
          }
          const minChunk = clamp(p.r * 0.18, 2.0, 18.0);
          if (e.r < minChunk) continue;
          const sizeRatio = e.r / Math.max(4, p.r);
          const eatDur = Math.max(0.05, sizeRatio * 0.9);
          if (eatDur < 0.12) {
            this.eatFood(e); e.dead = true;
          } else {
            p.eatTarget = e; p.eatTimer = eatDur; p.eatDuration = eatDur;
          }
          break;
        }
      } else if (e.kind === 'creature' && !e.dead) {
        if (handledCreatureBounce) continue;
        const overlap = p.r + e.r * 0.85 - d;
        if (overlap > 0) {
          const canEat = p.r > e.r * 1.05;
          if (canEat) {
            if (p.diet === 'herbivore') {
              // herbivores don't attack prey; bounce by size
              this.applyBodyBounce(p, e, overlap, 0.05);
              handledCreatureBounce = true;
              continue;
            }
            // start timed eat-kill
            const sizeRatio = e.r / Math.max(4, p.r);
            const eatDur = Math.max(0.2, sizeRatio * 1.2);
            const before = e.hp;
            e.takeDamage(p.biteDamage, 'player', this);
            const dealt = Math.max(0, before - e.hp);
            this.applyBodyBounce(p, e, overlap, clamp(dealt / 45, 0, 0.65));
            handledCreatureBounce = true;
            if (p.venomDPS > 0) e.applyVenom(p.venomDPS, p.venomDur);
            if (e.dead) {
              this.consumeCreature(e);
            } else if (eatDur > 0.5) {
              p.eatTarget = e; p.eatTimer = eatDur * 0.5; p.eatDuration = eatDur * 0.5;
              e.eatenMark = Math.min(1.2, e.eatenMark + 0.8);
            }
          } else {
            if (p.diet === 'carnivore' && p.bumpBiteCD <= 0) {
              const nibble = Math.max(1.2, p.biteDamage * 0.2);
              const before = e.hp;
              e.takeDamage(nibble, 'player', this);
              const dealt = Math.max(0, before - e.hp);
              this.applyBodyBounce(p, e, overlap, clamp(0.25 + dealt / 28, 0, 0.7));
              handledCreatureBounce = true;
              p.bumpBiteCD = 0.35;
              if (e.dead) this.consumeCreature(e);
            } else {
              if (p.diet === 'herbivore') p.sayPolite();
              this.applyBodyBounce(p, e, overlap, 0.0);
              handledCreatureBounce = true;
            }
          }
        }
      }
    }
  }

  eatFood(f) {
    const p = this.player;
    const isMeat = f.type === 'meat';
    const isPlantFood = f.type === 'plant';
    if (!isMeat && !isPlantFood) return;

    if (isPlantFood && f.links && f.links.size > 0) {
      this.breakFoodLinks(f, 26);
    }

    let energyGain = T.FOOD_VALUE_RICH * 1.4;
    // diet efficiency
    if (isMeat) {
      if (p.diet === 'herbivore') energyGain *= 0.1;
      else if (p.diet === 'carnivore') energyGain *= 2.0;
    } else {
      energyGain = T.FOOD_VALUE_BASIC * (1.1 + f.r * 0.2);
      if (p.diet === 'herbivore') energyGain *= 2.7;
      else if (p.diet === 'carnivore') energyGain *= 0.25;
      else energyGain *= 1.1;
    }
    p.energy = Math.min(p.stats.energyMax, p.energy + energyGain);
    const healScale = clamp(0.25 + f.r * 0.15, 0.28, 1.35);
    const healAmount = p.stats.hpMax * T.EAT_HEAL_FRACTION * healScale;
    p.hp = Math.min(p.stats.hpMax, p.hp + healAmount);
    this.grantDNA(1 + f.r * 0.12);
    p.foodMilestonePoints += 1.2 + f.r * 0.08;
    p.eaten++;
    p.eatGlow = 1;
    isMeat ? Audio.meatEat() : Audio.eat();
    this.particles.burst(f.x, f.y, 4, { speed: 60, life: 0.4, r: 1.6, h: f.hue, s: f.sat, l: f.light });
  }

  consumeCreature(c) {
    const p = this.player;
    p.kills++;
    p.eaten++;
    p.eatGlow = 1;
    const baseEnergy = 20 + c.r * 1.5;
    const energyGain = p.diet === 'carnivore' ? baseEnergy * 2 : p.diet === 'herbivore' ? baseEnergy * 0.15 : baseEnergy;
    p.energy = Math.min(p.stats.energyMax, p.energy + energyGain);
    p.hp = Math.min(p.stats.hpMax, p.hp + p.stats.hpMax * T.DEATH_HEAL_FOR_KILL);
    this.grantDNA(1.8 + c.r * 0.08);
    p.foodMilestonePoints += 2.4 + c.r * 0.12;
    p.species[c.templateId] = (p.species[c.templateId] || 0) + 1;
    this.dropPartShardsFromCreature(c, 1.0);
    this.dropMeatFromCreature(c, 1.0);
    this.particles.burst(c.x, c.y, 24, { speed: 160, life: 0.8, r: 2.5, h: 355, s: 80, l: 50 });
    p.diet === 'carnivore' ? Audio.meatEat() : Audio.kill();
  }

  dropMeatFromCreature(c, chunkScale = 1.0) {
    if (!c || c.meatDropped) return;
    c.meatDropped = true;
    const chunks = Math.max(1, Math.floor((2 + c.r / 9) * chunkScale));
    const totalArea = Math.PI * c.r * c.r * 0.6 * chunkScale;
    const eachR = Math.max(2.2, Math.min(14, Math.sqrt((totalArea / chunks) / Math.PI)));
    for (let i = 0; i < chunks; i++) {
      const a = Math.random() * TAU;
      const d = 10 + Math.random() * c.r * 1.5;
      const jitterR = eachR * (0.82 + Math.random() * 0.36);
      this.spawnFood(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 'meat', biomeAt(Math.hypot(c.x, c.y)), jitterR);
    }
  }

  dropPartShardsFromCreature(c, chanceMul = 1.0) {
    if (!c || c.partShardsDropped || !this.player || !this.player.discoveredParts) return;
    c.partShardsDropped = true;
    const uniqueParts = Array.from(new Set(c.parts || []));
    for (const part of uniqueParts) {
      if (this.player.discoveredParts.has(part)) continue;
      const dropChance = clamp(0.10 * chanceMul, 0.02, 0.2);
      if (Math.random() > dropChance) continue;
      const a = Math.random() * TAU;
      const d = 8 + Math.random() * Math.max(18, c.r * 1.1);
      this.partShards.push(new PartShard(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, part));
    }
  }

  collectPartShard(shard) {
    const p = this.player;
    if (!p || !p.discoveredParts) return;
    if (!p.discoveredParts.has(shard.partId)) {
      p.discoveredParts.add(shard.partId);
      this.codexRecent = `Discovered: ${shard.partId}`;
      this.ui.toast(`CODEX + ${shard.partId.toUpperCase()}`);
      this.grantDNA(1.2);
      this.particles.burst(shard.x, shard.y, 14, { speed: 95, life: 0.5, r: 1.7, h: 190, s: 80, l: 72 });
      Audio.event();
    }
    shard.dead = true;
  }

  onPlayerKill(c) {
    this.dropPartShardsFromCreature(c, 1.0);
    this.director.registerKill(c);
  }

  onCreatureHitPlayer(c) {
    Audio.hurt();
    this.particles.burst(this.player.x, this.player.y, 6, { speed: 110, life: 0.4, r: 1.6, h: 0, s: 80, l: 60 });
  }

  grantDNA(n) {
    this.player.dna += Math.max(0, n);
  }

  offerOmnivoreMilestone(isSecondChance) {
    const p = this.player;
    this.milestoneActive = true;

    const title = isSecondChance ? 'ABYSS CHOICE' : 'MAJOR MILESTONE';
    const body = isSecondChance
      ? 'You adapted this far without omnivore metabolism. Choose your final feeding strategy.'
      : 'Omnivore metabolism is now possible. Choose to unlock it now, or stay specialized.';

    this.ui.showEvent(title, body);

    const choices = [
      {
        id: 'unlock_omnivore',
        name: 'Unlock Omnivore',
        icon: 'gut',
        benefit: 'Can digest both plant and meat food sources.',
        cost: 'Lose herbivore passive regen bonus.',
        flavor: 'Versatility over specialization.'
      },
      {
        id: 'stay_specialized',
        name: isSecondChance ? 'Stay Specialized (Final)' : 'Stay Specialized (Not Now)',
        icon: 'meta',
        benefit: 'Keep your current diet identity and bonuses.',
        cost: isSecondChance ? 'Omnivore remains locked this run.' : 'Omnivore can be offered again in the abyss.',
        flavor: 'Commit to your current niche.'
      }
    ];

    this.ui.showMutationChoice(choices, (choice) => {
      if (choice.id === 'unlock_omnivore') {
        p.omnivoreUnlocked = true;
        p.omnivoreDeferred = false;
        p.diet = 'omnivore';
        if (p.discoveredParts) {
          p.discoveredParts.add('mandible');
          p.discoveredParts.add('filtermouth');
        }
        p.speciesTag = `${p.creatorBody}:omnivore`;
        p.herbivoreRegen = false;
        this.ui.toast('UNLOCKED · OMNIVORE');
        Audio.mutation();
        this.particles.burst(p.x, p.y, 36, { speed: 150, life: 1.0, r: 2.4, h: 205, s: 85, l: 75 });
      } else {
        if (!isSecondChance) p.omnivoreDeferred = true;
        this.ui.toast(isSecondChance ? 'SPECIALIZATION KEPT' : 'OMNIVORE DEFERRED');
      }
      this.milestoneActive = false;
    });
  }

  offerMutation() {
    if (this.player.mutationUnlockTokens <= 0 || this.player.dna < T.DNA_PER_MUTATION) return;
    const biomeIdx = BIOMES.findIndex(b => b.id === (this.lastBiomeId || 'bloom'));
    const pool = MUTATIONS.filter(m => {
      if (this.player.mutations.includes(m.id)) return false;
      if (m.biomeMin !== undefined && biomeIdx < m.biomeMin) return false;
      // only one diet mutation allowed
      if (m.id === 'carnivore' && this.player.diet !== 'omnivore') return false;
      if (m.id === 'herbivore_gut' && this.player.diet !== 'omnivore') return false;
      return true;
    });
    if (pool.length === 0) return;
    this.player.dna -= T.DNA_PER_MUTATION;
    this.player.mutationUnlockTokens--;
    const choices = [];
    const work = pool.slice();
    for (let i = 0; i < 2 && work.length; i++) {
      const idx = Math.floor(this.rng() * work.length);
      choices.push(work.splice(idx, 1)[0]);
    }

    const p = this.player;
    const evolved = new Set(p.evolvedParts || []);
    const known = Array.from(p.discoveredParts || []);
    const partChoices = known.filter((part) => !evolved.has(part));
    if (partChoices.length > 0) {
      const pick = partChoices[(Math.random() * partChoices.length) | 0];
      choices.push({
        id: `part_${pick}`,
        kind: 'part',
        partId: pick,
        name: `Integrate ${pick}`,
        icon: 'sense',
        benefit: `Adds ${pick} to your evolved anatomy and grants a trait boost.`,
        cost: 'Consumes one evolution choice.',
        flavor: 'Knowledge from the codex becomes living structure.'
      });
    }

    while (choices.length < 3 && work.length) {
      const idx = Math.floor(this.rng() * work.length);
      choices.push(work.splice(idx, 1)[0]);
    }

    this.mutationActive = true;
    this.ui.showMutationChoice(choices, (m) => {
      if (m.kind === 'part') {
        this.applyPartEvolution(m.partId);
        this.ui.toast('EVOLVED PART · ' + m.partId.toUpperCase());
      } else {
        this.player.applyMutation(m);
        this.ui.toast('MUTATED · ' + m.name);
      }
      Audio.mutation();
      this.particles.burst(this.player.x, this.player.y, 30, { speed: 160, life: 0.9, r: 2.4, h: 290, s: 85, l: 75 });
      this.mutationActive = false;
    });
  }

  applyPartEvolution(partId) {
    const p = this.player;
    if (!p.evolvedParts) p.evolvedParts = [];
    if (p.evolvedParts.includes(partId)) return;
    p.evolvedParts.push(partId);

    if (partId === 'fin') {
      p.stats.speedMul *= 1.08;
      p.stats.accelMul *= 1.06;
    } else if (partId === 'plate') {
      p.stats.defense += 10;
    } else if (partId === 'spike') {
      p.spikeDamage += 4;
    } else if (partId === 'eyespot') {
      p.stats.detectionMul *= 1.12;
    } else if (partId === 'mandible') {
      p.stats.biteMul *= 1.1;
    } else if (partId === 'filtermouth') {
      p.filter += 3;
    } else if (partId === 'tail') {
      p.stats.dashMul *= 1.06;
      p.stats.accelMul *= 1.04;
    } else if (partId === 'cilia') {
      p.stats.metabMul *= 0.95;
    } else if (partId === 'frill') {
      p.stats.hpMax += 12;
      p.hp = Math.min(p.stats.hpMax, p.hp + 8);
    } else if (partId === 'tendril') {
      p.stats.turnMul *= 1.12;
    }
  }

  spawnFood(x, y, type, biome, sizeOverride = null) {
    if (type !== 'meat' && type !== 'plant') return;
    if (this.foods.length >= T.FOOD_CAP) return;
    const safe = this.findSafeSpawnPoint(x, y, type === 'meat' ? 80 : 34, type === 'meat' ? 8 : 5, 6);
    if (!safe) return;
    const f = new Food(safe.x, safe.y, type, biome || biomeAt(Math.hypot(safe.x, safe.y)), sizeOverride);
    this.foods.push(f);
    return f;
  }

  emitHazardPlantFood(hz, dt) {
    if (!hz || hz.dead) return;
    if (hz.type !== 'spine_weed' && hz.type !== 'curl_weed') return;
    if (!hz.leaves || hz.leaves.length === 0) return;

    let plantCount = 0;
    for (let i = 0; i < this.foods.length; i++) {
      if (this.foods[i].type === 'plant') plantCount++;
    }
    if (plantCount >= Math.floor(T.FOOD_CAP * 0.7)) return;

    hz.emitPlantT = (hz.emitPlantT || (0.45 + Math.random() * 1.4)) - dt;
    if (hz.emitPlantT > 0) return;
    hz.emitPlantT = 0.35 + Math.random() * 1.55;

    const lf = hz.leaves[(Math.random() * hz.leaves.length) | 0];
    if (!lf) return;
    let a;
    let tipX;
    let tipY;
    if (hz.type === 'curl_weed') {
      a = lf.base + (lf.droop || 0) * 0.4 + Math.sin(hz.t * 0.8 + lf.base * 3) * (lf.curlJitter || 0.1) + (lf.curl || 0.8) * 0.25;
      tipX = hz.x + Math.cos(a + (lf.curl || 0.8) * 0.35) * lf.len;
      tipY = hz.y + Math.sin(a + (lf.curl || 0.8) * 0.35) * lf.len;
    } else {
      a = lf.base + (lf.bend || 0) + (lf.droop || 0) * 0.3;
      tipX = hz.x + Math.cos(a) * lf.len;
      tipY = hz.y + Math.sin(a) * lf.len;
    }

    const f = this.spawnFood(tipX, tipY, 'plant', biomeAt(Math.hypot(tipX, tipY)), 3 + Math.random() * 1.5);
    if (!f) return;
    const current = this.getCurrentVectorAt(tipX, tipY);
    const spd = 10 + Math.random() * 16;
    f.vx = Math.cos(a) * spd + current.x * 0.85;
    f.vy = Math.sin(a) * spd + current.y * 0.85;
    f.linkOrigin = 'hazard';
    f.relinkIntent = 0;
  }

  tryLinkPlantFoods(a, b, force = false) {
    if (!a || !b || a === b || a.dead || b.dead) return false;
    if (a.type !== 'plant' || b.type !== 'plant') return false;
    if (!a.links || !b.links) return false;
    if (a.links.has(b) || b.links.has(a)) return false;
    if (a.links.size >= 2 || b.links.size >= 2) return false;
    if (!force && (a.linkCooldown > 0 || b.linkCooldown > 0)) return false;
    a.links.add(b);
    b.links.add(a);
    a.linkCooldown = Math.max(a.linkCooldown, 0.45);
    b.linkCooldown = Math.max(b.linkCooldown, 0.45);
    return true;
  }

  breakFoodLinks(food, impulse = 18) {
    if (!food || !food.links || food.links.size === 0) return;
    food.snapT = Math.max(food.snapT || 0, 0.35);
    const linked = Array.from(food.links);
    for (const other of linked) {
      food.links.delete(other);
      if (!other || other.dead || !other.links) continue;
      other.links.delete(food);
      other.snapT = Math.max(other.snapT || 0, 0.35);
      other.relinkIntent = Math.max(other.relinkIntent || 0, 4 + Math.random() * 2);
      other.linkCooldown = Math.max(other.linkCooldown || 0, 0.22);
      const dx = other.x - food.x;
      const dy = other.y - food.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      other.vx += nx * impulse;
      other.vy += ny * impulse;
      food.vx -= nx * impulse * 0.55;
      food.vy -= ny * impulse * 0.55;
    }
    food.relinkIntent = 0;
  }

  resolvePlantFoodChains(dt) {
    const foods = this.foods;
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      if (!f || f.dead || f.type !== 'plant') continue;

      if (f.links && f.links.size > 0) {
        for (const o of Array.from(f.links)) {
          if (!o || o.dead || o.type !== 'plant') f.links.delete(o);
        }
      }

      if (f.relinkIntent > 0 && f.links.size < 2) {
        const nearby = this.grid.query(f.x, f.y, 120, this._scratch);
        let best = null;
        let bestD2 = Infinity;
        for (let j = 0; j < nearby.length; j++) {
          const o = nearby[j];
          if (!o || o === f || o.kind !== 'food' || o.type !== 'plant' || o.dead) continue;
          if ((o.relinkIntent || 0) <= 0) continue;
          if (f.links.has(o) || o.links.size >= 2) continue;
          const d2 = dist2(f.x, f.y, o.x, o.y);
          if (d2 < bestD2) { bestD2 = d2; best = o; }
        }
        if (best) {
          const dx = best.x - f.x;
          const dy = best.y - f.y;
          const d = Math.hypot(dx, dy) || 1;
          const attract = clamp(28 / d, 0.6, 2.4) * dt;
          f.vx += (dx / d) * attract * 22;
          f.vy += (dy / d) * attract * 22;
          best.vx -= (dx / d) * attract * 14;
          best.vy -= (dy / d) * attract * 14;
        }
      }

      const near = this.grid.query(f.x, f.y, 34, this._scratch);
      for (let j = 0; j < near.length; j++) {
        const o = near[j];
        if (!o || o === f || o.kind !== 'food' || o.type !== 'plant' || o.dead) continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y);
        if (d > f.r + o.r + 7.5) continue;
        this.tryLinkPlantFoods(f, o);
      }
    }

    for (let i = 0; i < foods.length; i++) {
      const a = foods[i];
      if (!a || a.dead || a.type !== 'plant' || !a.links || a.links.size === 0) continue;
      for (const b of a.links) {
        if (!b || b.dead || b.type !== 'plant') continue;
        if ((a.foodId || 0) >= (b.foodId || 0)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d;
        const ny = dy / d;
        const rest = a.r + b.r + 5.5;
        const stretch = d - rest;
        const k = (a.relinkIntent > 0 || b.relinkIntent > 0) ? 11.5 : 7.2;
        const pull = clamp(stretch * k * dt, -10, 10);
        a.vx += nx * pull;
        a.vy += ny * pull;
        b.vx -= nx * pull;
        b.vy -= ny * pull;
      }
    }
  }

  isInsideRock(x, y, buffer = 0) {
    for (const rock of this.rocks) {
      const dx = x - rock.x, dy = y - rock.y;
      const d = Math.hypot(dx, dy);
      if (d > rock.maxR + buffer + 2) continue;
      const rr = rock._effectiveRadiusForCircle(Math.atan2(dy, dx), d, buffer * 0.72 + 0.6);
      if (d < rr) return true;
    }
    return false;
  }

  resolveRockStickCollisions(dt) {
    const rocks = this.rocks;
    const n = rocks.length;
    const stick = Math.min(1, dt * 4.2);
    const spinStick = stick * 0.6;
    for (let i = 0; i < n; i++) {
      const a = rocks[i];
      for (let j = i + 1; j < n; j++) {
        const b = rocks[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = a.maxR + b.maxR + 4;
        if (d >= minD || d <= 0.0001) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = minD - d;
        // Mass-weighted positional split.
        const ma = a.mass || 1, mb = b.mass || 1;
        const inv = 1 / (ma + mb);
        const pushA = overlap * (mb * inv);
        const pushB = overlap * (ma * inv);
        a.x -= nx * pushA;
        a.y -= ny * pushA;
        b.x += nx * pushB;
        b.y += ny * pushB;
        if (a.crevice) { a.crevice.cx -= nx * pushA; a.crevice.cy -= ny * pushA; }
        if (b.crevice) { b.crevice.cx += nx * pushB; b.crevice.cy += ny * pushB; }
        // Light restitution on the normal component, then average toward each other (stick).
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const relN = rvx * nx + rvy * ny;
        if (relN < 0) {
          const e = 0.5;
          const jImp = -(1 + e) * relN / (ma + mb);
          a.vx -= jImp * mb * nx;
          a.vy -= jImp * mb * ny;
          b.vx += jImp * ma * nx;
          b.vy += jImp * ma * ny;
        }
        // Velocity averaging — keeps them snug instead of jittering.
        const avgVx = (a.vx * ma + b.vx * mb) * inv;
        const avgVy = (a.vy * ma + b.vy * mb) * inv;
        a.vx += (avgVx - a.vx) * stick;
        a.vy += (avgVy - a.vy) * stick;
        b.vx += (avgVx - b.vx) * stick;
        b.vy += (avgVy - b.vy) * stick;
        // Spin averaging.
        const avgSpin = (a.spin * ma + b.spin * mb) * inv;
        a.spin += (avgSpin - a.spin) * spinStick;
        b.spin += (avgSpin - b.spin) * spinStick;
      }
    }
  }

  // ── Plant chunk clustering — 5 close plant-food chunks fuse into a new plant ──
  _resolvePlantChunkClustering(dt) {
    if (this.plants.length >= T.PLANT_CAP) return;
    const foods = this.foods;
    const radius = PLANT_TUNE.CLUSTER_RADIUS;
    const required = PLANT_TUNE.CLUSTER_REQUIRED_CHUNKS;
    const reqTime = PLANT_TUNE.CLUSTER_REQUIRED_TIME;
    // Cohesion pass: chunks within a larger neighborhood pull strongly toward
    // each other so they actually meet the cluster radius. Without this,
    // drifting chunks rarely accumulate enough density on their own.
    const cohRadius = radius * 3.0;
    const cohR2 = cohRadius * cohRadius;
    const cohForce = 95;
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      if (!f || f.dead || f.type !== 'plant') continue;
      const near = this.grid.query(f.x, f.y, cohRadius, this._scratch);
      let nx = 0, ny = 0, n = 0;
      for (let j = 0; j < near.length; j++) {
        const o = near[j];
        if (!o || o === f || o.kind !== 'food' || o.dead || o.type !== 'plant') continue;
        // Don't pull a chunk toward another chunk emitted by the same plant
        // it just left — they should disperse first.
        if (f._sourcePlant && f._sourcePlant === o._sourcePlant) continue;
        if (f._sourceColonyId !== undefined && f._sourceColonyId === o._sourceColonyId) continue;
        const dx = o.x - f.x, dy = o.y - f.y;
        const d2 = dx*dx + dy*dy;
        if (d2 > cohR2 || d2 < 1) continue;
        const inv = 1 / Math.sqrt(d2);
        nx += dx * inv; ny += dy * inv; n++;
      }
      if (n > 0) {
        f.vx += (nx / n) * cohForce * dt;
        f.vy += (ny / n) * cohForce * dt;
        // Mild damping during cohesion so chunks lose drift inertia and settle.
        f.vx *= (1 - 0.8 * dt);
        f.vy *= (1 - 0.8 * dt);
      }
    }
    const seen = new Set();
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      if (!f || f.dead || f.type !== 'plant') continue;
      if (seen.has(f)) continue;
      const near = this.grid.query(f.x, f.y, radius, this._scratch);
      const group = [f];
      for (let j = 0; j < near.length; j++) {
        const o = near[j];
        if (!o || o === f || o.kind !== 'food' || o.dead || o.type !== 'plant') continue;
        if (dist2(o.x, o.y, f.x, f.y) <= radius * radius) group.push(o);
        if (group.length >= required) break;
      }
      if (group.length < required) continue;
      // Track cluster cohesion timer on the seed chunk.
      f._clusterT = (f._clusterT || 0) + dt;
      if (f._clusterT < reqTime) {
        for (const c of group) seen.add(c);
        continue;
      }
      // Fuse — consume chunks, spawn a new PlantStructure at the centroid.
      let cx = 0, cy = 0;
      for (const c of group) { cx += c.x; cy += c.y; c.dead = true; }
      cx /= group.length; cy /= group.length;
      let nearest = null;
      let nearestD2 = Infinity;
      for (let pIdx = 0; pIdx < this.plants.length; pIdx++) {
        const pl = this.plants[pIdx];
        if (!pl || pl.dead) continue;
        const d2 = dist2(cx, cy, pl.x, pl.y);
        if (d2 < nearestD2) { nearestD2 = d2; nearest = pl; }
      }
      const minPlantDist = PLANT_TUNE.MIN_DISTANCE_BETWEEN_PLANTS;
      if (nearest && nearestD2 < minPlantDist * minPlantDist) {
        if (nearest.branches && nearest.branches.length > 0) {
          let growBranch = nearest.branches[0];
          for (let bi = 1; bi < nearest.branches.length; bi++) {
            if (nearest.branches[bi].leaves.length < growBranch.leaves.length) growBranch = nearest.branches[bi];
          }
          nearest._growBranch(growBranch, nearest.rng || this.rng || Math.random);
          nearest._emitGrowthFx(cx, cy, 1.1, 'sprout');
        }
        this.particles.burst(cx, cy, 6, { speed: 50, life: 0.45, r: 1.6, h: nearest ? nearest.hue : 115, s: 68, l: 68 });
      } else {
        const scale = clamp(this.getOutwardScaleAt(cx, cy), 1, 10);
        const plant = new PlantStructure(cx, cy, this.rng, scale);
        this.plants.push(plant);
        this.particles.burst(cx, cy, 8, { speed: 60, life: 0.5, r: 1.8, h: plant.hue, s: 70, l: 70 });
      }
      for (const c of group) seen.add(c);
    }
    // Decay cluster timers on chunks that drifted apart.
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      if (!f || f.type !== 'plant' || f.dead) continue;
      if (f._clusterT && !seen.has(f)) f._clusterT = Math.max(0, f._clusterT - dt * 2);
    }
  }

  // Legacy hooks kept as compatibility no-ops — PlantStructure now manages its
  // own tip-to-tip links and drawing internally.
  updatePlantLinking(dt) {
    this._resolvePlantChunkClustering(dt);
  }

  drawPlantLinks(/* ctx, w, h */) { /* handled inside PlantStructure.draw */ }

  findSafeSpawnPoint(x, y, jitter = 120, tries = 10, buffer = 8, minPlayerDistance = 0) {
    let px = x, py = y;
    for (let i = 0; i < tries; i++) {
      const playerD = Math.hypot(px - this.player.x, py - this.player.y);
      if (!this.isInsideRock(px, py, buffer) && playerD >= minPlayerDistance) {
        return { x: px, y: py };
      }
      const a = this.rng() * TAU;
      const d = (i + 1) * (jitter / tries + 12);
      px = x + Math.cos(a) * d;
      py = y + Math.sin(a) * d;
    }
    return null;
  }

  hasEscapeRoute(x, y, actorR = 10, pathLen = 640) {
    const rays = 24;
    const step = 36;
    const clearance = actorR + 8;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      let blocked = false;
      for (let d = step; d <= pathLen; d += step) {
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d;
        if (this.isInsideRock(px, py, clearance)) { blocked = true; break; }
      }
      if (!blocked) return true;
    }
    return false;
  }

  findSafeSpawnPointWithEscape(x, y, jitter = 180, tries = 24, buffer = 10, minPlayerDistance = 0, pathLen = 640) {
    for (let i = 0; i < tries; i++) {
      const a = this.rng() * TAU;
      const d = i === 0 ? 0 : (jitter * (0.25 + this.rng() * 1.6) + i * 8);
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      const safe = this.findSafeSpawnPoint(px, py, jitter, 14, buffer, minPlayerDistance);
      if (!safe) continue;
      if (this.hasEscapeRoute(safe.x, safe.y, buffer, pathLen)) return safe;
    }
    return this.findSafeSpawnPoint(x, y, jitter, tries, buffer, minPlayerDistance);
  }

  _distancePointToSegment(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - x1, py - y1);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - x2, py - y2);
    const t = c1 / c2;
    const sx = x1 + t * vx;
    const sy = y1 + t * vy;
    return Math.hypot(px - sx, py - sy);
  }

  clearSpawnTrapRocks(cx, cy, safeR = 320, corridorLen = 1600, corridorWidth = 140) {
    const dirs = 16;
    let bestA = 0;
    let bestBlocked = Infinity;
    for (let i = 0; i < dirs; i++) {
      const a = (i / dirs) * TAU;
      const ex = cx + Math.cos(a) * corridorLen;
      const ey = cy + Math.sin(a) * corridorLen;
      let blocked = 0;
      for (const rock of this.rocks) {
        const dc = Math.hypot(rock.x - cx, rock.y - cy);
        if (dc < safeR + rock.maxR) { blocked++; continue; }
        const ds = this._distancePointToSegment(rock.x, rock.y, cx, cy, ex, ey);
        if (ds < corridorWidth + rock.maxR) blocked++;
      }
      if (blocked < bestBlocked) {
        bestBlocked = blocked;
        bestA = a;
      }
    }

    const ex = cx + Math.cos(bestA) * corridorLen;
    const ey = cy + Math.sin(bestA) * corridorLen;
    this.rocks = this.rocks.filter((rock) => {
      const dc = Math.hypot(rock.x - cx, rock.y - cy);
      if (dc < safeR + rock.maxR) return false;
      const ds = this._distancePointToSegment(rock.x, rock.y, cx, cy, ex, ey);
      if (ds < corridorWidth + rock.maxR) return false;
      return true;
    });
  }

  applyBodyBounce(a, b, overlap, damageReduction = 0) {
    if (!a || !b || overlap <= 0) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    const ma = Math.max(1, a.r * a.r);
    const mb = Math.max(1, b.r * b.r);
    const msum = ma + mb;
    const soften = clamp(1 - damageReduction, 0.3, 1);
    const penetration = Math.max(0, overlap - 0.6);
    if (penetration <= 0) return;

    const sepA = penetration * (mb / msum) * 0.36;
    const sepB = penetration * (ma / msum) * 0.36;
    a.x -= nx * sepA;
    a.y -= ny * sepA;
    b.x += nx * sepB;
    b.y += ny * sepB;

    // Dampen only while closing along the contact normal.
    const relVx = b.vx - a.vx;
    const relVy = b.vy - a.vy;
    const relN = relVx * nx + relVy * ny;
    if (relN < 0) {
      const damp = Math.min(20, -relN * 0.52) * soften;
      a.vx += nx * damp * (mb / msum);
      a.vy += ny * damp * (mb / msum);
      b.vx -= nx * damp * (ma / msum);
      b.vy -= ny * damp * (ma / msum);

      // Small restitution only while closing; avoids ping-pong shaking.
      const restitution = 0.10;
      const j = -(1 + restitution) * relN;
      const imp = Math.min(7.5, j * 0.16) * soften;
      a.vx -= nx * imp * (mb / msum);
      a.vy -= ny * imp * (mb / msum);
      b.vx += nx * imp * (ma / msum);
      b.vy += ny * imp * (ma / msum);
    }

    // Blend velocities slightly toward shared motion to suppress micro-oscillation.
    const avgVx = (a.vx * ma + b.vx * mb) / msum;
    const avgVy = (a.vy * ma + b.vy * mb) / msum;
    const velStick = 0.09;
    a.vx += (avgVx - a.vx) * velStick;
    a.vy += (avgVy - a.vy) * velStick;
    b.vx += (avgVx - b.vx) * velStick;
    b.vy += (avgVy - b.vy) * velStick;

    const tangentialDamp = 0.982;
    a.vx *= tangentialDamp;
    a.vy *= tangentialDamp;
    b.vx *= tangentialDamp;
    b.vy *= tangentialDamp;
  }

  resolveCreatureBodyCollisions() {
    const list = this.creatures;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a || a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b || b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        // Collision radius matches the visual silhouette (source.r * 0.92)
        // rather than the previous 0.78 — creatures were visibly overlapping
        // each other because physics fired only at 78% of the rendered size.
        const minD = a.r * 0.92 + b.r * 0.92;
        if (d >= minD) continue;
        const overlap = minD - d;
        this.applyBodyBounce(a, b, overlap, 0.22);
      }
    }
  }

  updateCreatureFeeding(dt) {
    for (const c of this.creatures) {
      if (c.dead) continue;

      const minChunk = clamp(c.r * 0.18, 1.8, 16.0);
      // Map physical size to a pseudo growth tier so larger creatures can
      // naturally transition from chunk -> leaf -> node feeding even if their
      // explicit growthLevel lags behind their body size.
      const sizeTier = Math.max(0, Math.floor((c.r - 8) / 5));
      const eatTier = Math.max(c.growthLevel || 0, sizeTier);

      if (c.diet === 'carnivore' || c.diet === 'omnivore') {
        const nearby = this.grid.query(c.x, c.y, c.r + 26, this._scratch);
        for (const e of nearby) {
          if (e.kind !== 'food' || e.dead || e.type !== 'meat') continue;
          if (e.r < minChunk) continue;
          const d = Math.hypot(e.x - c.x, e.y - c.y);
          if (d > c.r + e.r + 2) continue;
          e.dead = true;
          c.hunger = Math.max(0, c.hunger - 0.45);
          c.hp = Math.min(c.maxHP, c.hp + 4 + e.r * 1.8);
          c.eatenMark = Math.min(1.2, c.eatenMark + 0.65);
          c.growBy(2.5 + e.r * 0.8, this);
          this.particles.burst(e.x, e.y, 4, { speed: 60, life: 0.4, r: 1.5, h: 355, s: 80, l: 58 });
          break;
        }

        // Opportunistic predation: nearby larger predators should actually
        // convert contact into food pressure, not only rely on rare AI attack
        // state transitions.
        if ((c.hunger || 0) > 0.18) {
          const nearbyPrey = this.grid.query(c.x, c.y, c.r + 18, this._scratch);
          for (const p of nearbyPrey) {
            if (!p || p.kind !== 'creature' || p === c || p.dead) continue;
            if (p.isEscort || p.legendary) continue;
            if (p.r > c.r * 0.92) continue;
            const d = Math.hypot(p.x - c.x, p.y - c.y);
            if (d > c.r + p.r + 4) continue;
            if (c.attackCD > 0) continue;

            const bite = c.biteDmg * (0.72 + Math.min(0.65, c.angry * 0.25));
            p.takeDamage(bite, 'creature', this);
            c.attackCD = Math.max(c.attackCD, 0.42);
            c.hunger = Math.max(0, c.hunger - 0.06);
            if (p.dead) {
              this.consumeCreature(p);
              c.hunger = Math.max(0, c.hunger - 0.22);
              c.eatenMark = Math.min(1.2, c.eatenMark + 0.6);
            }
            break;
          }
        }
      }

      if (c.diet === 'herbivore' || c.diet === 'omnivore') {
        // Loose plant chunks (ejected from nodes / drifting in currents).
        const chunkGate = (window.GROWTH_THRESHOLDS && window.GROWTH_THRESHOLDS.plantChunkEat != null)
          ? window.GROWTH_THRESHOLDS.plantChunkEat : 0;
        if (eatTier >= chunkGate) {
          const nearbyFood = this.grid.query(c.x, c.y, c.r + 58, this._scratch);
          for (const e of nearbyFood) {
            if (e.kind !== 'food' || e.dead || e.type !== 'plant') continue;
            if (e.r < minChunk * 0.35) continue;
            const d = Math.hypot(e.x - c.x, e.y - c.y);
            if (d > c.r + e.r + 2) continue;
            e.dead = true;
            c.hunger = Math.max(0, c.hunger - 0.36);
            c.hp = Math.min(c.maxHP, c.hp + 2.6 + e.r * 1.35);
            c.eatenMark = Math.min(1.2, c.eatenMark + 0.62);
            c.growBy(2.2 + e.r * 0.9, this);
            this.particles.burst(e.x, e.y, 3, { speed: 45, life: 0.35, r: 1.3, h: e.hue, s: 70, l: 65 });
            break;
          }
        }

        // Lower bite-size gate on structures so large bodies can still nibble
        // leaves and eventually nodes instead of being blocked by minChunk.
        const minPlantBite = clamp(c.r * 0.10, 1.0, 8.0);
        for (const pl of this.plants) {
          if (pl.dead) continue;
          const d2 = dist2(c.x, c.y, pl.x, pl.y);
          if (d2 > 360 * 360) continue;
          const gain = pl.eatFrom(c.x, c.y, c.r, this, minPlantBite, c.vx, c.vy, eatTier);
          if (gain > 0) {
            c.hunger = Math.max(0, c.hunger - gain * 0.035 * dt * 8);
            c.hp = Math.min(c.maxHP, c.hp + gain * 0.024 * dt * 8);
            c.eatenMark = Math.min(1.2, c.eatenMark + 0.6);
            c.growBy(gain * 1.02, this);
            break;
          }
        }
      }
    }
  }

  queryFoodNear(x, y, r) {
    const out = [];
    const list = this.grid.query(x, y, r, this._scratch);
    for (let i = 0; i < list.length; i++) if (list[i].kind === 'food') out.push(list[i]);
    return out;
  }

  findFood(x, y, r, claimer = null, preferSafe = false) {
    const list = this.grid.query(x, y, r, []);
    let best = null, bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.kind !== 'food') continue;
      const dx = e.x - x, dy = e.y - y;
      const d2 = dx*dx + dy*dy;

      // Simulate competition by preferring less contested food nodes.
      let crowd = 0;
      let dominated = false;
      const nearby = this.grid.query(e.x, e.y, 130, []);
      for (let j = 0; j < nearby.length; j++) {
        const o = nearby[j];
        if (o.kind !== 'creature' || o.dead || o === claimer) continue;
        crowd++;
        if (claimer && o.r > claimer.r * 1.2 && dist2(o.x, o.y, e.x, e.y) < d2 * 0.9) {
          dominated = true;
        }
      }
      if (dominated) continue;

      let score = d2 * (1 + crowd * 0.22);
      if (preferSafe && claimer) {
        const pd = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (pd < this.player.r + claimer.r + 220) continue;
        const cv = this.nearestRockCrevice(e.x, e.y);
        const coverDist = cv ? Math.hypot(e.x - cv.cx, e.y - cv.cy) : 9999;
        const coverPenalty = clamp(coverDist / 420, 0, 2.2);
        score *= (1 + coverPenalty * 0.35);
      }
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  findSafeFoodForCreature(creature, r) {
    if (!creature) return null;
    return this.findFood(creature.x, creature.y, r, creature, true);
  }

  findPlantTargetForCreature(creature, r, groupMode = false) {
    if (!creature) return null;

    let herdX = creature.x;
    let herdY = creature.y;
    let herdN = 1;
    if (groupMode) {
      const nearby = this.grid.query(creature.x, creature.y, 260, this._scratch);
      for (let i = 0; i < nearby.length; i++) {
        const e = nearby[i];
        if (e.kind !== 'creature' || e === creature || e.dead) continue;
        if (e.diet !== creature.diet) continue;
        if (Math.abs(e.r - creature.r) > creature.r * 0.6) continue;
        herdX += e.x;
        herdY += e.y;
        herdN++;

        // Borrow a nearby herd mate's active food target when valid.
        if (e.target && !e.target.dead && dist2(e.target.x, e.target.y, creature.x, creature.y) < (r * r * 1.2)) {
          return e.target;
        }
      }
      herdX /= herdN;
      herdY /= herdN;
    }

    let best = null;
    let bestScore = Infinity;
    const rr = r * r;
    for (let i = 0; i < this.plants.length; i++) {
      const pl = this.plants[i];
      if (!pl || pl.dead || !pl.nodes || pl.nodes.length < 2) continue;
      const d2 = dist2(pl.x, pl.y, creature.x, creature.y);
      if (d2 > rr) continue;

      let crowd = 0;
      const nearby = this.grid.query(pl.x, pl.y, 180, this._scratch);
      for (let j = 0; j < nearby.length; j++) {
        const o = nearby[j];
        if (o.kind === 'creature' && !o.dead && o !== creature && (o.diet === 'herbivore' || o.diet === 'omnivore')) crowd++;
      }

      const herdBias = groupMode ? dist2(pl.x, pl.y, herdX, herdY) * 0.3 : 0;
      const richness = Math.max(1, pl.nodes.length);
      const score = (d2 + herdBias) * (1 + crowd * 0.08) / richness;
      if (score < bestScore) {
        bestScore = score;
        best = pl;
      }
    }
    return best;
  }

  findPlantChunkTargetForCreature(creature, r, groupMode = false) {
    if (!creature) return null;
    const list = this.grid.query(creature.x, creature.y, r, this._scratch);
    const chunkGate = (window.GROWTH_THRESHOLDS && window.GROWTH_THRESHOLDS.plantChunkEat != null)
      ? window.GROWTH_THRESHOLDS.plantChunkEat : 7;
    if ((creature.growthLevel || 0) < chunkGate) return null;

    let herdX = creature.x;
    let herdY = creature.y;
    let herdN = 1;
    if (groupMode) {
      const nearby = this.grid.query(creature.x, creature.y, 240, this._scratch);
      for (let i = 0; i < nearby.length; i++) {
        const e = nearby[i];
        if (e.kind !== 'creature' || e === creature || e.dead) continue;
        if (e.diet !== creature.diet) continue;
        if (Math.abs(e.r - creature.r) > creature.r * 0.7) continue;
        herdX += e.x;
        herdY += e.y;
        herdN++;
      }
      herdX /= herdN;
      herdY /= herdN;
    }

    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.kind !== 'food' || e.dead || e.type !== 'plant') continue;
      const d2 = dist2(e.x, e.y, creature.x, creature.y);
      let crowd = 0;
      const near = this.grid.query(e.x, e.y, 120, this._scratch);
      for (let j = 0; j < near.length; j++) {
        const o = near[j];
        if (o.kind === 'creature' && !o.dead && o !== creature && (o.diet === 'herbivore' || o.diet === 'omnivore')) crowd++;
      }
      const herdBias = groupMode ? dist2(e.x, e.y, herdX, herdY) * 0.18 : 0;
      // Prefer bigger chunks slightly because they satisfy hunger faster.
      const sizeBias = 1 / Math.max(0.8, e.r);
      const score = (d2 + herdBias) * (1 + crowd * 0.12) * sizeBias;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  findFoodTargetForCreature(creature, r, groupMode = false) {
    if (!creature) return null;
    if (creature.diet === 'carnivore') {
      return this.findSafeFoodForCreature(creature, r) || this.findFood(creature.x, creature.y, r * 0.8, creature, false);
    }

    if (creature.diet === 'herbivore') {
      const chunk = this.findPlantChunkTargetForCreature(creature, r, groupMode);
      const plant = this.findPlantTargetForCreature(creature, r, groupMode);
      if (!chunk) return plant;
      if (!plant) return chunk;
      const cd2 = dist2(chunk.x, chunk.y, creature.x, creature.y);
      const pd2 = dist2(plant.x, plant.y, creature.x, creature.y);
      // Herbivores should strongly favor loose chunks when available.
      return cd2 < pd2 * 1.75 ? chunk : plant;
    }

    // Omnivores can choose nearest viable source.
    const chunk = this.findPlantChunkTargetForCreature(creature, r * 0.9, groupMode);
    const meat = this.findSafeFoodForCreature(creature, r) || this.findFood(creature.x, creature.y, r * 0.8, creature, false);
    const plant = this.findPlantTargetForCreature(creature, r, groupMode);
    if (!meat && !plant) return chunk;
    if (chunk && !meat) return chunk;
    if (chunk && !plant) return chunk;
    if (chunk && plant) {
      const cd2 = dist2(chunk.x, chunk.y, creature.x, creature.y);
      const pd2 = dist2(plant.x, plant.y, creature.x, creature.y);
      if (cd2 < pd2 * 1.35) return chunk;
    }
    if (!meat) return plant;
    if (!plant) return meat;
    const md2 = dist2(meat.x, meat.y, creature.x, creature.y);
    const pd2 = dist2(plant.x, plant.y, creature.x, creature.y);
    return pd2 < md2 * 1.15 ? plant : meat;
  }

  findMateTargetForCreature(creature, r = 620) {
    if (!creature || creature.dead) return null;
    const minGrowthLevel = (window.GROWTH_THRESHOLDS && window.GROWTH_THRESHOLDS.npcMateMin) || 3;
    if ((creature.growthLevel || 0) < minGrowthLevel) return null;
    if (creature.mateCD > 0) return null;

    const nearby = this.grid.query(creature.x, creature.y, r, this._scratch);
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < nearby.length; i++) {
      const o = nearby[i];
      if (!o || o.kind !== 'creature' || o === creature || o.dead) continue;
      if (o.isEscort || o.legendary) continue;
      if (o.speciesTag !== creature.speciesTag) continue;
      if ((o.growthLevel || 0) < minGrowthLevel) continue;
      if (o.mateCD > 0) continue;
      const ratio = o.r / Math.max(1, creature.r);
      if (ratio < 0.45 || ratio > 2.4) continue;

      const d2 = dist2(o.x, o.y, creature.x, creature.y);
      // Prefer closer mates with lower local competition.
      let crowd = 0;
      const nearMate = this.grid.query(o.x, o.y, 140, this._scratch);
      for (let j = 0; j < nearMate.length; j++) {
        const n = nearMate[j];
        if (!n || n.kind !== 'creature' || n.dead || n === creature || n === o) continue;
        if (n.speciesTag === creature.speciesTag) crowd++;
      }
      const score = d2 * (1 + crowd * 0.12);
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  // ── NPC same-species reproduction ─────────────────────────────────────────
  // Periodically scan for two adjacent same-species creatures that are both
  // grown, healthy, and off-cooldown. Spawn one offspring matched to their
  // template at growth level 0.
  updateNpcMating(dt) {
    this._npcMatingT = (this._npcMatingT || 0) + dt;
    if (this._npcMatingT < 1.0) return; // throttle to ~once per second
    this._npcMatingT = 0;
    if (!this.creatures.length || this.creatures.length > 240) return; // population cap

    const list = this.creatures;
    const minGrowthLevel = (window.GROWTH_THRESHOLDS && window.GROWTH_THRESHOLDS.npcMateMin) || 3;
    const range = 80;

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!this._isMatingEligible(a, minGrowthLevel)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!this._isMatingEligible(b, minGrowthLevel)) continue;
        if (a.speciesTag !== b.speciesTag) continue;
        if (a.templateId !== b.templateId) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > range) continue;
        this._spawnNpcOffspring(a, b);
        a.mateCD = 60 + this.rng() * 30;
        b.mateCD = 60 + this.rng() * 30;
        break; // a is busy this tick
      }
    }
    // Tick down cooldowns once per scan.
    for (let i = 0; i < list.length; i++) {
      if (list[i].mateCD > 0) list[i].mateCD = Math.max(0, list[i].mateCD - 1.0);
    }
  }

  _isMatingEligible(c, minGrowthLevel) {
    if (!c || c.dead || c.legendary || c.isEscort) return false;
    if ((c.growthLevel || 0) < minGrowthLevel) return false;
    if ((c.mateCD || 0) > 0) return false;
    if ((c.hp / c.maxHP) < 0.55) return false;
    if (c.hunger > 0.75) return false;
    return true;
  }

  _spawnNpcOffspring(a, b) {
    const templ = CREATURE_TEMPLATES[a.templateId] || CREATURE_TEMPLATES.drifter;
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    const child = new Creature(mx, my, templ, {
      rng: this.rng,
      hue: a.hue,
      sizeOverride: Math.min(a.r, b.r) * 0.5,
    });
    child.diet = a.diet;
    child.speciesTag = a.speciesTag;
    child.growthLevel = 0;
    child.bornAt = this.totalTime || 0;
    child.name = genCreatureName(this.rng);
    this.creatures.push(child);
    this.particles.burst(mx, my, 8, { speed: 60, life: 0.7, r: 1.6, h: a.hue || 200, s: 70, l: 75 });
  }

  findCorpse(x, y, r) {
    let best = null, bestD2 = Infinity;
    for (let i = 0; i < this.creatures.length; i++) {
      const e = this.creatures[i];
      if (!e.dead) continue;
      const dx = e.x - x, dy = e.y - y;
      const d2 = dx*dx + dy*dy;
      if (d2 < r*r && d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  }

  nearestRockCrevice(x, y) {
    let best = null, bestD2 = Infinity;
    for (const rock of this.rocks) {
      const dx = rock.crevice.cx - x, dy = rock.crevice.cy - y;
      const d2 = dx*dx + dy*dy;
      if (d2 < 600*600 && d2 < bestD2) { bestD2 = d2; best = rock.crevice; }
    }
    return best;
  }

  getRockAvoidedGoal(x, y, goalX, goalY, radius = 8) {
    let nx = goalX;
    let ny = goalY;
    let best = null;
    let bestD2 = Infinity;
    for (const rock of this.rocks) {
      const dx = rock.x - x;
      const dy = rock.y - y;
      const d2 = dx * dx + dy * dy;
      const threatR = rock.maxR + radius + 70;
      if (d2 > threatR * threatR) continue;
      if (d2 < bestD2) { bestD2 = d2; best = rock; }
    }
    // If no nearby rock threat, avoid dense plant structures too.
    if (!best) {
      for (let i = 0; i < this.plants.length; i++) {
        const pl = this.plants[i];
        if (!pl || pl.dead) continue;
        const dx = pl.x - x;
        const dy = pl.y - y;
        const d2 = dx * dx + dy * dy;
        const plantThreatR = 86 + radius + Math.min(90, (pl.branches ? pl.branches.length : 0) * 7);
        if (d2 > plantThreatR * plantThreatR) continue;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = {
            x: pl.x,
            y: pl.y,
            maxR: plantThreatR - radius,
          };
        }
      }
    }
    if (!best) return { x: nx, y: ny };

    const toGoalX = goalX - x;
    const toGoalY = goalY - y;
    const gl = Math.hypot(toGoalX, toGoalY) || 1;
    const gx = toGoalX / gl;
    const gy = toGoalY / gl;
    const rx = best.x - x;
    const ry = best.y - y;
    const rl = Math.hypot(rx, ry) || 1;
    const nxr = rx / rl;
    const nyr = ry / rl;
    const toward = gx * nxr + gy * nyr;
    if (toward < 0.35) return { x: nx, y: ny };

    const side = (gx * nyr - gy * nxr) > 0 ? 1 : -1;
    const tx = -nyr * side;
    const ty = nxr * side;
    const skirt = best.maxR + radius + 120;
    nx = best.x + tx * skirt;
    ny = best.y + ty * skirt;
    return { x: nx, y: ny };
  }

  // Is creature a valid mate for the player (same diet, similar size, not legendary)
  isCompatibleMate(creature) {
    const p = this.player;
    if (creature.dead || creature.legendary || creature.isEscort) return false;
    if (creature.diet !== p.diet) return false;
    if (creature.speciesTag !== p.speciesTag) return false;
    const ratio = creature.r / p.r;
    return ratio > 0.4 && ratio < 2.4;
  }

  updateMating(dt) {
    const p = this.player;
    if (p.hatching) {
      p.hatchT += dt;
      if (p.egg) p.egg.update(dt);
      if (p.hatchT >= T.EGG_HATCH_TIME) {
        this._completeHatch(p);
      }
      return;
    }
    if (p.mating) return; // brief mating animation, handled in resolvePlayerCollisions

    // Find nearest compatible mate
    let nearMate = null, nearDist = T.MATE_RANGE;
    for (const c of this.creatures) {
      if (!this.isCompatibleMate(c)) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < nearDist) { nearDist = d; nearMate = c; }
    }

    if (nearMate) {
      p.mateTarget = nearMate;
      p.mateT += dt;
      if (p.mateT >= T.MATE_TIME) {
        this._triggerMating(nearMate);
      }
    } else {
      p.mateTarget = null;
      p.mateT = Math.max(0, p.mateT - dt * 2);
    }
  }

  _triggerMating(mother) {
    const p = this.player;
    p.mating = false;
    p.mateT = 0;
    p.hatching = true;
    p.hatchT = 0;

    // Egg drops at player position
    const egg = new Egg(p.x, p.y, p.creatorHue !== undefined ? p.creatorHue : 195);
    p.egg = egg;
    this.eggs.push(egg);

    // Freeze player movement
    p.vx = 0; p.vy = 0;
    p.eggX = p.x; p.eggY = p.y;

    // Mother becomes escort
    mother.behavior = 'escort';
    mother.state = 'escort';
    mother.isEscort = true;
    p.escortB = mother;

    this.ui.toast('MATING · INCUBATING');
    Audio.mutation();
    this.particles.burst(p.x, p.y, 20, { speed: 60, life: 1.2, r: 2, h: egg.hue, s: 70, l: 70 });
  }

  _completeHatch(p) {
    p.hatching = false;
    p.hatchT = 0;
    if (p.egg) {
      this.eggs = this.eggs.filter(e => e !== p.egg);
      p.egg = null;
    }

    // Spawn "old self" escort creature whose template matches the player's
    // creator-selected body shape so the offspring shares the player's
    // species visually and mechanically.
    const templ = templateForPlayerSpecies(p);
    const oldSelf = new Creature(p.x + 20, p.y, templ, {
      rng: this.rng,
      hue: p.creatorHue !== undefined ? p.creatorHue : 195,
      sizeOverride: p.r,
    });
    oldSelf.behavior = 'escort';
    oldSelf.state = 'escort';
    oldSelf.isEscort = true;
    oldSelf.diet = p.diet;
    oldSelf.speciesTag = p.speciesTag;
    // Match the player's growth level so the offspring is at the same
    // developmental stage.
    oldSelf.growthLevel = p.growthLevel || 0;
    p.escortA = oldSelf;
    this.creatures.push(oldSelf);

    p.mutationUnlockTokens += 1;
    this.ui.toast('HATCHED · MUTATION WINDOW OPEN');
    this.particles.burst(p.x, p.y, 40, { speed: 120, life: 1.0, r: 2.5, h: p.creatorHue || 195, s: 80, l: 75 });
  }

  endGame() {
    this.gameOver = true;
    Audio.death();
    const p = this.player;
    Save.recordRun(this.seedString, {
      time: p.totalTime, maxSize: p.maxSizeReached,
      legendaries: Array.from(this.director.legendariesSeen)
    });
    this.ui.showGameOver(p, this.director, this.seedString, p.totalTime);
  }

  // ── DRAW ────────────────────────────────────────────────────────────────
  draw() {
    const ctx = this.ctx;
    const w = this.viewW, h = this.viewH;
    const p = this.player;
    const biome = biomeAt(Math.hypot(p.x, p.y));

    // background
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h));
    bgGrad.addColorStop(0, hslaCSS(biome.bgInner[0], biome.bgInner[1], biome.bgInner[2], 1));
    bgGrad.addColorStop(1, hslaCSS(biome.bgOuter[0], biome.bgOuter[1], biome.bgOuter[2], 1));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // depth particles (parallax dust)
    this.drawDust(ctx, w, h);

    // apply zoom transform for world-space drawing
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-w * 0.5, -h * 0.5);

    // rocks (drawn below everything else)
    for (let i = 0; i < this.rocks.length; i++) this.rocks[i].draw(ctx, this.camX, this.camY, w, h);

    // hazards
    for (let i = 0; i < this.hazards.length; i++) this.hazards[i].draw(ctx, this.camX, this.camY, w, h, this);

    // plant clusters (below food)
    for (let i = 0; i < this.plants.length; i++) this.plants[i].draw(ctx, this.camX, this.camY, w, h);
    this.drawPlantLinks(ctx, w, h);

    // foods (under creatures)
    for (let i = 0; i < this.foods.length; i++) this.foods[i].draw(ctx, this.camX, this.camY, w, h);

    // collectible part shards
    for (let i = 0; i < this.partShards.length; i++) this.partShards[i].draw(ctx, this.camX, this.camY, w, h);

    // particles (background layer)
    this.particles.draw(ctx, this.camX, this.camY, w, h);

    // creatures
    if (this.softCreaturesEnabled()) this.drawSoftCreatures(ctx, w, h);
    else for (let i = 0; i < this.creatures.length; i++) this.creatures[i].draw(ctx, this.camX, this.camY, w, h);

    // player
    if (p) {
      if (this.softCreaturesEnabled() && this.softPlayer) this.drawSoftPlayer(ctx, w, h);
      else p.draw(ctx, this.camX, this.camY, w, h);
    }

    // eggs (on top of player layer)
    for (const egg of this.eggs) {
      if (!p.egg || egg !== p.egg) egg.draw(ctx, this.camX, this.camY, w, h);
    }

    // world edge ring
    this.drawWorldEdge(ctx, w, h);

    ctx.restore();

    // dark/abyss vignette
    if (biome.id === 'abyss' || biome.id === 'vent') {
      const vg = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.2, w*0.5, h*0.5, Math.max(w,h)*0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, biome.id === 'abyss' ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawDust(ctx, w, h) {
    // Pixel-block dust grid with parallax + storybook color palette
    const cell = 96;
    const px = -this.camX * 0.4;
    const py = -this.camY * 0.4;
    const startX = Math.floor((-px) / cell) - 1;
    const startY = Math.floor((-py) / cell) - 1;
    const cols = Math.ceil(w / cell) + 3;
    const rows = Math.ceil(h / cell) + 3;
    const palette = [
      'rgba(255,244,200,0.55)',
      'rgba(180,232,255,0.50)',
      'rgba(255,200,228,0.45)',
      'rgba(210,255,220,0.50)'
    ];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cx = startX + gx;
        const cy = startY + gy;
        const seed = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
        const r = (seed % 1000) / 1000;
        if (r < 0.72) continue;
        const ox = ((seed >> 3) % 1000) / 1000 * cell;
        const oy = ((seed >> 11) % 1000) / 1000 * cell;
        const sx = Math.round(px + cx * cell + ox);
        const sy = Math.round(py + cy * cell + oy);
        if (sx < -6 || sy < -6 || sx > w + 6 || sy > h + 6) continue;
        ctx.fillStyle = palette[(seed >> 7) % palette.length];
        const big = (seed >> 19) & 1;
        const size = big ? 3 : 2;
        ctx.fillRect(sx, sy, size, size);
      }
    }
  }

  drawWorldEdge(ctx, w, h) {
    const sx = -this.camX + w * 0.5;
    const sy = -this.camY + h * 0.5;
    // Open-ended progression rings and explicit biome transition rings.
    const maxViewR = Math.hypot(w, h) * 0.85 / Math.max(0.25, this.zoom);
    const guideStep = RING_SIZE * 9;
    const camR = Math.hypot(this.camX, this.camY);
    const minTier = Math.max(0, Math.floor((camR - maxViewR) / guideStep));
    const maxTier = Math.max(minTier + 1, Math.floor((camR + maxViewR) / guideStep) + 1);
    for (let tier = minTier; tier <= maxTier; tier++) {
      const r = (tier + 1) * guideStep;
      const hue = 170 + (tier * 28) % 180;
      ctx.strokeStyle = hslaCSS(hue, 50, 60, 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.stroke();
    }

    // Stronger guides at exact biome transitions.
    for (const b of BIOMES) {
      if (!Number.isFinite(b.outer)) continue;
      const r = b.outer;
      if (Math.abs(r - camR) > maxViewR * 1.2) continue;
      ctx.strokeStyle = hslaCSS(188, 70, 68, 0.16);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.stroke();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  validateCreaturePartVisuals();
  const game = new Game();
  window.GAME = game;
});

})();
