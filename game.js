'use strict';

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
  PLANT_CAP: 16,
  ROCK_COUNT: 18,
  MATE_RANGE: 55,
  MATE_TIME: 2.2,
  EGG_HATCH_TIME: 5.0,
  ESCORT_RANGE: 260,
  CREATURE_CAP: 140,
  FOOD_CAP: 280,
  HAZARD_CAP: 24,
  SPAWN_RADIUS: 1400,
  DESPAWN_RADIUS: 2200,
  GRID_CELL: 180,
  DT_MAX: 0.05,
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
  _lastDash: false,
  _lastPause: false,
  _pausePulse: false,

  scrollDelta: 0,

  attach(canvas) {
    this.isMobile = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ' || k === 'spacebar') this._pausePulse = true;
      if (k === ' ' || k === 'spacebar' || k === 'escape' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === 'w' || k === 'a' || k === 's' || k === 'd') {
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
    const dash = this.keys.has('shift') || this.touchDashPressed;
    this.dashEdge = dash && !this._lastDash;
    this._lastDash = dash;
    const pause = this.keys.has(' ') || this.keys.has('spacebar') || this.touchPausePressed;
    this.pauseEdge = this._pausePulse || (pause && !this._lastPause);
    this._pausePulse = false;
    this._lastPause = pause;
  },

  axis() {
    if (this.touchActive) return [this.touchX, this.touchY];
    let x = 0, y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft'))  x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup'))    y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown'))  y += 1;
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
// CREATURE TEMPLATES — base archetypes; visuals & stats roll procedurally
// ─────────────────────────────────────────────────────────────────────────────
const CREATURE_TEMPLATES = {
  drifter: {
    id: 'drifter', name: 'Drifter',
    behavior: 'wander', sizeRange: [4, 9], speed: 22, accel: 55,
    hpMul: 0.6, biteDmg: 2, aggression: 0, fearMul: 1.2, hunger: 0.3,
    body: 'soft', parts: ['cilia'], huesShift: 0, swarmy: false,
    food: 'nutrient', xp: 1, diet: 'omnivore'
  },
  grazer: {
    id: 'grazer', name: 'Grazer',
    behavior: 'graze', sizeRange: [6, 11], speed: 40, accel: 100,
    hpMul: 0.9, biteDmg: 3, aggression: 0, fearMul: 1.0, hunger: 0.5,
    body: 'round', parts: ['cilia', 'eyespot'], huesShift: 20, swarmy: false,
    food: 'nutrient', xp: 2, diet: 'herbivore'
  },
  swarmer: {
    id: 'swarmer', name: 'Swarmer',
    behavior: 'swarm', sizeRange: [3, 5], speed: 65, accel: 165,
    hpMul: 0.4, biteDmg: 4, aggression: 0.5, fearMul: 0.5, hunger: 0.6,
    body: 'oval', parts: ['tail'], huesShift: -10, swarmy: true,
    food: 'nutrient', xp: 1, diet: 'omnivore'
  },
  darter: {
    id: 'darter', name: 'Darter',
    behavior: 'darter', sizeRange: [7, 12], speed: 95, accel: 240,
    hpMul: 0.7, biteDmg: 6, aggression: 0.3, fearMul: 0.8, hunger: 0.5,
    body: 'oval', parts: ['tail', 'eyespot'], huesShift: 30, swarmy: false,
    food: 'meat_small', xp: 3, diet: 'carnivore'
  },
  small_hunter: {
    id: 'small_hunter', name: 'Hunter',
    behavior: 'hunt', sizeRange: [10, 16], speed: 65, accel: 165,
    hpMul: 1.2, biteDmg: 10, aggression: 0.7, fearMul: 0.7, hunger: 0.7,
    body: 'oval', parts: ['tail', 'eyespot', 'fin'], huesShift: 0, swarmy: false,
    food: 'meat_small', xp: 5, diet: 'carnivore'
  },
  ambusher: {
    id: 'ambusher', name: 'Lurker',
    behavior: 'ambush', sizeRange: [11, 18], speed: 38, accel: 290,
    hpMul: 1.4, biteDmg: 16, aggression: 0.9, fearMul: 0.4, hunger: 0.6,
    body: 'long', parts: ['spike', 'eyespot'], huesShift: -30, swarmy: false,
    food: 'meat_small', xp: 6, diet: 'carnivore'
  },
  territorial: {
    id: 'territorial', name: 'Sentinel',
    behavior: 'territorial', sizeRange: [12, 20], speed: 44, accel: 135,
    hpMul: 1.5, biteDmg: 12, aggression: 0.95, fearMul: 0.5, hunger: 0.3,
    body: 'round', parts: ['spike', 'spike', 'eyespot'], huesShift: 10, swarmy: false,
    food: 'meat_small', xp: 7, diet: 'omnivore'
  },
  scavenger: {
    id: 'scavenger', name: 'Scavenger',
    behavior: 'scavenge', sizeRange: [9, 14], speed: 55, accel: 135,
    hpMul: 0.8, biteDmg: 5, aggression: 0.2, fearMul: 0.9, hunger: 0.8,
    body: 'oval', parts: ['tail', 'eyespot'], huesShift: 40, swarmy: false,
    food: 'meat_any', xp: 3, diet: 'omnivore'
  },
  armored: {
    id: 'armored', name: 'Plated One',
    behavior: 'territorial', sizeRange: [14, 22], speed: 33, accel: 100,
    hpMul: 2.2, biteDmg: 14, aggression: 0.7, fearMul: 0.3, hunger: 0.4,
    body: 'round', parts: ['plate', 'plate', 'eyespot'], huesShift: 20, swarmy: false,
    food: 'nutrient', xp: 8, diet: 'herbivore'
  },
  apex: {
    id: 'apex', name: 'Devourer',
    behavior: 'hunt', sizeRange: [22, 38], speed: 70, accel: 195,
    hpMul: 3.0, biteDmg: 32, aggression: 1.0, fearMul: 0.2, hunger: 0.6,
    body: 'long', parts: ['tail', 'fin', 'eyespot', 'mandible'], huesShift: -20, swarmy: false,
    food: 'meat_small', xp: 18, diet: 'carnivore'
  },
  parasite: {
    id: 'parasite', name: 'Parasite',
    behavior: 'parasite', sizeRange: [4, 7], speed: 82, accel: 210,
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

  get speed()      { return T.PLAYER_MAX_SPEED * this.stats.speedMul; }
  get accel()      { return T.PLAYER_ACCEL * this.stats.accelMul; }
  get detection()  { return T.DETECTION_BASE * this.stats.detectionMul; }
  get biteDamage() { return T.PLAYER_BITE_DAMAGE * this.stats.biteMul * (1 + (this.r - T.PLAYER_START_SIZE) * 0.04); }

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

    // body
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);

    // body — shape/color from creator or defaults
    const bodyShape = this.creatorBody || 'round';
    const bodyHue = this.creatorHue !== undefined ? this.creatorHue : 195;
    ctx.fillStyle = hslaCSS(bodyHue, 75, 75, 0.95);
    ctx.strokeStyle = hslaCSS(bodyHue, 80, 85, 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (bodyShape === 'oval')      ctx.ellipse(0, 0, r*1.2, r*0.78, 0, 0, TAU);
    else if (bodyShape === 'long') ctx.ellipse(0, 0, r*1.45, r*0.62, 0, 0, TAU);
    else if (bodyShape === 'soft') {
      const st = (performance.now() * 0.002) % 1;
      for (let i = 0; i < 12; i++) {
        const a = i/12*TAU; const rr = r*(0.92+Math.sin(a*3+st*6)*0.08);
        if (i===0) ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);
        else ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);
      }
      ctx.closePath();
    } else {
      ctx.ellipse(0, 0, r*1.05, r*0.88, 0, 0, TAU);
    }
    ctx.fill(); ctx.stroke();

    // nucleus
    ctx.fillStyle = hslaCSS(bodyHue, 70, 50, 0.55);
    ctx.beginPath(); ctx.arc(r * 0.05, 0, r * 0.32, 0, TAU); ctx.fill();

    // eye (front)
    ctx.fillStyle = hslaCSS(0, 0, 100, 0.85);
    ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.18, r * 0.13, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(0, 0, 0, 1);
    ctx.beginPath(); ctx.arc(r * 0.43, -r * 0.18, r * 0.06, 0, TAU); ctx.fill();

    // mutation visuals
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
    if (has('spikes')) {
      ctx.strokeStyle = hslaCSS(40, 30, 80, 0.9);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        const x1 = Math.cos(a) * r * 0.9;
        const y1 = Math.sin(a) * r * 0.78;
        const x2 = Math.cos(a) * r * 1.55;
        const y2 = Math.sin(a) * r * 1.35;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    if (has('armor') || has('plates')) {
      ctx.strokeStyle = hslaCSS(200, 30, 65, 0.6);
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.18, r * 1.0, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.1, a, a + 0.25);
        ctx.stroke();
      }
    }
    if (has('eyes')) {
      const positions = [[-0.35, -0.45], [-0.6, -0.05], [-0.35, 0.45]];
      for (const [px, py] of positions) {
        ctx.fillStyle = hslaCSS(0, 0, 100, 0.85);
        ctx.beginPath(); ctx.arc(px * r, py * r, r * 0.1, 0, TAU); ctx.fill();
        ctx.fillStyle = hslaCSS(0, 0, 0, 1);
        ctx.beginPath(); ctx.arc(px * r, py * r, r * 0.045, 0, TAU); ctx.fill();
      }
    }
    if (has('glow')) {
      const grad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 3);
      grad.addColorStop(0, hslaCSS(55, 90, 75, 0.22));
      grad.addColorStop(1, hslaCSS(55, 90, 60, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, TAU); ctx.fill();
    }
    if (has('jet')) {
      ctx.fillStyle = hslaCSS(190, 80, 70, 0.6);
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 0.3);
      ctx.lineTo(-r * 1.6, 0);
      ctx.lineTo(-r * 0.9, r * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    if (has('venom')) {
      ctx.fillStyle = hslaCSS(110, 70, 55, 0.7);
      ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.18, 0, TAU); ctx.fill();
    }
    if (has('filter')) {
      ctx.strokeStyle = hslaCSS(180, 50, 75, 0.5);
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.45 + i * 0.15;
        ctx.beginPath();
        ctx.moveTo(r * 0.8, 0);
        ctx.lineTo(r * 1.6 * Math.cos(a) + r * 0.4, r * 1.0 * Math.sin(a));
        ctx.stroke();
      }
    }
    if (has('mandibles')) {
      ctx.fillStyle = hslaCSS(30, 30, 80, 0.85);
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -r * 0.3);
      ctx.quadraticCurveTo(r * 1.5, -r * 0.15, r * 1.3, 0);
      ctx.quadraticCurveTo(r * 1.5, r * 0.15, r * 0.9, r * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    if (has('fins')) {
      ctx.fillStyle = hslaCSS(195, 70, 70, 0.55);
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 0.85);
      ctx.quadraticCurveTo(-r * 0.6, -r * 1.4, -r * 0.9, -r * 0.6);
      ctx.lineTo(-r * 0.4, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, r * 0.85);
      ctx.quadraticCurveTo(-r * 0.6, r * 1.4, -r * 0.9, r * 0.6);
      ctx.lineTo(-r * 0.4, r * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    if (has('camo')) {
      ctx.fillStyle = hslaCSS(195, 30, 50, 0.18);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
    }
    if (has('predator_sense')) {
      ctx.strokeStyle = hslaCSS(280, 80, 70, 0.25);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, TAU); ctx.stroke();
    }

    if (this.evolvedParts && this.evolvedParts.length > 0) {
      if (this.evolvedParts.includes('frill')) {
        ctx.strokeStyle = hslaCSS((this.creatorHue || 190) + 25, 65, 78, 0.5);
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI * 0.7 + i * 0.22;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.78);
          ctx.lineTo(Math.cos(a) * r * 1.28, Math.sin(a) * r * 0.98);
          ctx.stroke();
        }
      }
      if (this.evolvedParts.includes('tendril')) {
        ctx.strokeStyle = hslaCSS(this.creatorHue || 190, 45, 72, 0.52);
        ctx.lineWidth = 0.9;
        const t = Math.sin(performance.now() * 0.006 + this.totalTime * 0.8) * r * 0.28;
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, -r * 0.12);
        ctx.bezierCurveTo(-r * 1.2, -r * 0.2 + t * 0.2, -r * 1.55, -r * 0.28, -r * 1.9, -r * 0.15 + t);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, r * 0.12);
        ctx.bezierCurveTo(-r * 1.2, r * 0.2 - t * 0.2, -r * 1.55, r * 0.28, -r * 1.9, r * 0.15 - t);
        ctx.stroke();
      }
    }
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

    this._ensureCoreAnatomy(rng);
    this._refreshGrowthLevel(rng, true);
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

    if (Math.hypot(this.vx, this.vy) > 5) {
      const t = Math.atan2(this.vy, this.vx);
      const d = angDelta(this.angle, t);
      const turnRate = (2.6 - clamp(this.r / 42, 0, 0.95)) * dt;
      this.angle += clamp(d, -turnRate, turnRate);
    }

    this.scared = Math.max(0, this.scared - dt * 0.4);
    this.angry = Math.max(0, this.angry - dt * 0.2);
    this.attackCD = Math.max(0, this.attackCD - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.6);
    this.eatenMark = Math.max(0, this.eatenMark - dt * 1.35);
    this.growthPulse = Math.max(0, this.growthPulse - dt * 1.05);
    this.hunger = Math.min(this.maxHunger, this.hunger + dt * 0.02);
    this.stateT += dt;

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
    if (next === 'seekFood' || next === 'scavenge') {
      this.targetT -= 0.4;
      if (!this.target || this.target.dead || this.targetT < 0) {
        if (next === 'scavenge') this.target = game.findCorpse(this.x, this.y, 600);
        else this.target = game.findFoodTargetForCreature(this, 480, true);
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
        this.wanderAngle += (Math.random() - 0.5) * 1.2 * dt;
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
        if (this.target && !this.target.dead) { goalX = this.target.x; goalY = this.target.y; drive = 0.88; }
        else {
          this.wanderAngle += (Math.random() - 0.5) * 1.5 * dt;
          goalX = this.x + Math.cos(this.wanderAngle) * 220;
          goalY = this.y + Math.sin(this.wanderAngle) * 220;
          drive = 0.58;
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

    // steer toward goal
    let dx = goalX - this.x, dy = goalY - this.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.1) { dx /= len; dy /= len; }
    const a = this.accel * drive;
    this.vx += dx * a * dt;
    this.vy += dy * a * dt;

    // friction + gentle float drift
    const fr = Math.max(0, 1 - 2.2 * dt);
    this.vx *= fr; this.vy *= fr;
    // subtle ambient drift
    this.vx += Math.sin(this.wanderAngle * 1.7 + this.stateT) * 1.0 * dt;
    this.vy += Math.cos(this.wanderAngle * 1.3 + this.stateT * 0.9) * 1.0 * dt;

    const cur = game.getCurrentVectorAt(this.x, this.y);
    this.vx += cur.x * dt * 0.2;
    this.vy += cur.y * dt * 0.2;

    // clamp speed
    const v = Math.hypot(this.vx, this.vy);
    const mv = this.maxSpeed * drive;
    if (v > mv) { this.vx = this.vx / v * mv; this.vy = this.vy / v * mv; }
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

    // body shape
    const bodyHue = lerp(this.hue, 0, clamp(this.hitFlash * 0.6, 0, 1));
    const bodySat = lerp(this.sat, 85, clamp(this.hitFlash * 0.7, 0, 1));
    const bodyLight = lerp(this.light, 62, clamp(this.hitFlash * 0.55, 0, 1));
    ctx.fillStyle = hslaCSS(bodyHue, bodySat, bodyLight, 0.9 * deathFade);
    ctx.strokeStyle = hslaCSS(this.hue, this.sat, Math.min(100, this.light + 18), 0.75 * deathFade);
    ctx.lineWidth = 1.1;
    if (this.body === 'oval') {
      ctx.beginPath(); ctx.ellipse(0, 0, wr * 1.2, wr * 0.78, 0, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (this.body === 'long') {
      ctx.beginPath(); ctx.ellipse(0, 0, wr * 1.45, wr * 0.62, 0, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (this.body === 'soft') {
      ctx.beginPath();
      const t = (performance.now() * 0.002 + this.bornAt) % 1;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        const rr = wr * (0.92 + Math.sin(a * 3 + t * 6) * 0.08);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, wr, 0, TAU); ctx.fill(); ctx.stroke();
    }

    // nucleus
    ctx.fillStyle = hslaCSS(this.hue, this.sat - 10, Math.max(20, this.light - 25), 0.4 * deathFade);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();

    // parts
    for (const part of this.parts) this.drawPart(ctx, part, r, deathFade);

    ctx.restore();

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
      case 'cilia':
        ctx.strokeStyle = hslaCSS(this.hue, this.sat - 20, this.light + 5, 0.4 * fade);
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.78);
          ctx.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.0);
          ctx.stroke();
        }
        break;
      case 'tail': {
        const t = Math.sin(performance.now() * 0.008 + this.bornAt * 10) * 0.4;
        ctx.fillStyle = hslaCSS(this.hue, this.sat, this.light, 0.6 * fade);
        ctx.beginPath();
        ctx.moveTo(-r * 1.0, -r * 0.18);
        ctx.quadraticCurveTo(-r * 1.6, t * r, -r * 1.9, -r * 0.05);
        ctx.lineTo(-r * 1.8, r * 0.05);
        ctx.quadraticCurveTo(-r * 1.6, t * r + r * 0.2, -r * 1.0, r * 0.18);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'eyespot':
        ctx.fillStyle = hslaCSS(0, 0, 100, 0.85 * fade);
        ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.2, r * 0.13, 0, TAU); ctx.fill();
        ctx.fillStyle = hslaCSS(0, 0, 0, fade);
        ctx.beginPath(); ctx.arc(r * 0.58, -r * 0.2, r * 0.06, 0, TAU); ctx.fill();
        break;
      case 'spike':
        ctx.strokeStyle = hslaCSS(this.hue, 20, 85, 0.85 * fade);
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 5; i++) {
          const a = -0.5 + i * 0.25;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.85);
          ctx.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.45);
          ctx.stroke();
        }
        break;
      case 'plate':
        ctx.strokeStyle = hslaCSS(this.hue, 20, this.light + 10, 0.6 * fade);
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.18, r * 1.0, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.85, 0, 0, TAU); ctx.stroke();
        break;
      case 'fin':
        ctx.fillStyle = hslaCSS(this.hue, this.sat - 10, this.light + 5, 0.55 * fade);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.6);
        ctx.quadraticCurveTo(-r * 0.6, -r * 1.4, -r * 0.9, -r * 0.5);
        ctx.lineTo(-r * 0.3, -r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, r * 0.6);
        ctx.quadraticCurveTo(-r * 0.6, r * 1.4, -r * 0.9, r * 0.5);
        ctx.lineTo(-r * 0.3, r * 0.7);
        ctx.closePath();
        ctx.fill();
        break;
      case 'mandible':
        ctx.fillStyle = hslaCSS(30, 20, 80, 0.85 * fade);
        ctx.beginPath();
        ctx.moveTo(r * 0.9, -r * 0.35);
        ctx.quadraticCurveTo(r * 1.7, -r * 0.2, r * 1.4, 0);
        ctx.quadraticCurveTo(r * 1.7, r * 0.2, r * 0.9, r * 0.35);
        ctx.closePath();
        ctx.fill();
        break;
      case 'filtermouth':
        ctx.strokeStyle = hslaCSS(95, 35, 82, 0.8 * fade);
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const a = -0.42 + i * 0.17;
          ctx.beginPath();
          ctx.moveTo(r * 0.55, 0);
          ctx.lineTo(r * (1.25 + Math.cos(a) * 0.1), r * Math.sin(a) * 0.7);
          ctx.stroke();
        }
        break;
      case 'frill':
        ctx.strokeStyle = hslaCSS(this.hue + 25, this.sat, this.light + 16, 0.68 * fade);
        ctx.lineWidth = 1.1;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI * 0.62 + i * 0.2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.8);
          ctx.quadraticCurveTo(Math.cos(a) * r * 1.42, Math.sin(a) * r * 1.05, Math.cos(a) * r * 1.22, Math.sin(a) * r * 0.85);
          ctx.stroke();
        }
        break;
      case 'tendril': {
        ctx.strokeStyle = hslaCSS(this.hue - 8, this.sat - 12, this.light + 8, 0.62 * fade);
        ctx.lineWidth = 0.95;
        for (let i = 0; i < 3; i++) {
          const side = i - 1;
          const t = Math.sin(performance.now() * 0.006 + this.bornAt * 6 + i) * r * 0.3;
          ctx.beginPath();
          ctx.moveTo(-r * 0.85, side * r * 0.22);
          ctx.bezierCurveTo(-r * 1.25, side * r * 0.38 + t * 0.25, -r * 1.6, side * r * 0.48 - t * 0.2, -r * 1.95, side * r * 0.35 + t);
          ctx.stroke();
        }
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
    this.r = sizeOverride != null ? sizeOverride : (type === 'meat' ? 4.5 + Math.random() * 2 : 2.5);
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
    if (this.links && this.links.size > 0) {
      for (const o of this.links) {
        if (!o || o.dead || o === this) this.links.delete(o);
      }
    }
    this.t += dt * (0.8 + Math.abs(this.vx + this.vy) * 0.02);
    this.x += this.vx * dt; this.y += this.vy * dt;
    // gentle ambient float drift
    const swayMul = this.type === 'plant' ? 2.1 : 1.2;
    const damp = this.type === 'plant' ? 0.16 : 0.55;
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

    const pulse = 0.85 + 0.15 * Math.sin(this.t * 4);
    const glowR = this.r * 3;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
    grad.addColorStop(0, hslaCSS(this.hue, this.sat, this.light, 0.6 * pulse));
    grad.addColorStop(1, hslaCSS(this.hue, this.sat, this.light, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, glowR, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(this.hue, this.sat, Math.min(95, this.light + 15), 0.95);
    ctx.beginPath(); ctx.arc(sx, sy, this.r * pulse, 0, TAU); ctx.fill();

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
// PLANT CLUSTERS — branching organic food structures for herbivores
// ─────────────────────────────────────────────────────────────────────────────
class PlantCluster {
  constructor(x, y, rng, scale = 1) {
    this.x = x; this.y = y;
    this.dead = false;
    this.life = 120 + rng() * 100;
    this.hue = 80 + rng() * 50;
    this.scale = clamp(scale || 1, 1, 10);
    this.flowPhase = rng() * TAU;
    this.flowBias = rng() * TAU;
    this.flowDrift = 0.7 + rng() * 1.1;
    this.totalHP = 0;
    this.nodes = [];
    this._build(rng);
  }

  _build(rng) {
    const scaleMul = this.scale;
    const root = { x: this.x, y: this.y, vx: 0, vy: 0, parent: null, r: 5 * Math.pow(scaleMul, 0.78), hp: 18 * Math.pow(scaleMul, 0.7), maxHP: 18 * Math.pow(scaleMul, 0.7), angle: 0, length: 0 };
    this.nodes.push(root);
    const branches = 2 + Math.floor(rng() * 3);
    for (let b = 0; b < branches; b++) {
      const baseAngle = (b / branches) * TAU + rng() * 0.8 - 0.4;
      let parentNode = root;
      const segs = 3 + Math.floor(rng() * 4);
      for (let s = 0; s < segs; s++) {
        const segLen = (18 + rng() * 14) * Math.pow(this.scale, 0.72);
        const a = baseAngle + (rng() - 0.5) * 0.7;
        const nr = Math.max(1.8 * Math.pow(this.scale, 0.6), (4.5 - s * 0.55) * Math.pow(this.scale, 0.64));
        const nodeHP = Math.max(4 * Math.pow(this.scale, 0.55), (15 - s * 2) * Math.pow(this.scale, 0.72));
        const newNode = {
          x: parentNode.x + Math.cos(a) * segLen,
          y: parentNode.y + Math.sin(a) * segLen,
          vx: 0, vy: 0, parent: parentNode,
          r: nr, hp: nodeHP, maxHP: nodeHP,
          angle: a, length: segLen, baseAngle: a
        };
        this.nodes.push(newNode);
        parentNode = newNode;
        // small sub-branch chance
        if (s > 0 && rng() < 0.35) {
          const sa = a + (rng() < 0.5 ? 0.6 : -0.6) + (rng() - 0.5) * 0.4;
          const sLen = (10 + rng() * 10) * Math.pow(this.scale, 0.68);
          this.nodes.push({
            x: parentNode.x + Math.cos(sa) * sLen,
            y: parentNode.y + Math.sin(sa) * sLen,
            vx: 0, vy: 0, parent: parentNode,
            r: Math.max(1.4 * Math.pow(this.scale, 0.55), nr - 1), hp: 5 * Math.pow(this.scale, 0.55), maxHP: 5 * Math.pow(this.scale, 0.55),
            angle: sa, length: sLen, baseAngle: sa
          });
        }
      }
    }
    this.totalHP = this.nodes.reduce((s, n) => s + n.maxHP, 0);
  }

  update(dt, entities, game, drift = { x: 0, y: 0 }) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    const T_now = performance.now() * 0.001;
    // global current drift applied uniformly to all plants.
    this.x += drift.x * dt * 0.42;
    this.y += drift.y * dt * 0.42;

    // gentle sway + very slow natural rotation
    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const sway = Math.sin(T_now * 0.6 + i * 0.9) * 0.012;
      const rx = n.x - this.x, ry = n.y - this.y;
      const spin = this.spin || 0;
      const rot = 0.018 + spin * 0.07;
      n.vx += sway + (-ry) * rot * dt + drift.x * dt * 0.56;
      n.vy += sway * 0.5 + (rx) * rot * dt + drift.y * dt * 0.56;
    }

    if (this.spin) this.spin *= Math.max(0, 1 - dt * 0.35);

    // spring pull back to parent
    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const p = n.parent;
      if (!p) continue;
      const dx = n.x - p.x, dy = n.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const force = (d - n.length) * 0.22;
      n.vx -= (dx / d) * force;
      n.vy -= (dy / d) * force;
    }

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      n.x += n.vx * dt; n.y += n.vy * dt;
      n.vx *= 0.86; n.vy *= 0.86;
      if (i === 0) { n.x = this.x; n.y = this.y; n.vx = 0; n.vy = 0; }
    }

    // entity collisions — bump and maybe break
    for (let ei = 0; ei < entities.length; ei++) {
      const e = entities[ei];
      if (e.dead || e.r < 2) continue;
      for (let i = 1; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const dx = e.x - n.x, dy = e.y - n.y;
        const d = Math.hypot(dx, dy);
        const overlap = e.r * 0.7 + n.r - d;
        if (overlap > 0) {
          const spd = Math.hypot(e.vx, e.vy);
          n.vx -= (e.vx * 0.2) * dt * 12;
          n.vy -= (e.vy * 0.2) * dt * 12;

          if (spd > 42) {
            const push = Math.min(1.8, overlap * 0.08) * clamp((spd - 30) / 120, 0, 1.2);
            const dirx = d > 0.001 ? (dx / d) : 0;
            const diry = d > 0.001 ? (dy / d) : 0;
            this.x -= dirx * push;
            this.y -= diry * push;
            const relx = n.x - this.x;
            const rely = n.y - this.y;
            const cross = relx * e.vy - rely * e.vx;
            this.spin = (this.spin || 0) + clamp(cross / 90000, -0.35, 0.35);
          }

          // high-speed collision damages/breaks node
          if (spd > 74) {
            n.hp -= Math.max(0, spd - 58) * dt * 0.22;
            if (n.hp <= 0) {
              // collect this node + descendants, break off as a floating mini-cluster
              this._breakOff(n, e.vx, e.vy, game);
              n.dead = true;
            }
          }
        }
      }
    }
    // cascade: orphaned nodes (whose parent died) also die
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of this.nodes) {
        if (!n.dead && n.parent && n.parent.dead) { n.dead = true; changed = true; }
      }
    }
    this.nodes = this.nodes.filter(n => !n.dead);
    if (this.nodes.length < 2) this.dead = true;
  }

  // Collect all descendants of a node (including itself)
  _descendants(node) {
    const result = [node];
    for (const n of this.nodes) {
      if (!n.dead && n.parent === node) result.push(...this._descendants(n));
    }
    return result;
  }

  // Break a branch off as an independent floating mini-cluster
  _breakOff(node, impactVx, impactVy, game) {
    if (!node.parent) return; // don't break root
    const parentNode = node.parent;
    const descendants = this._descendants(node);
    if (descendants.length < 2) return;

    const moved = new Set(descendants);
    this.nodes = this.nodes.filter(n => !moved.has(n));

    // Create a mini PlantCluster rooted at node's current position
    const mini = Object.create(PlantCluster.prototype);
    mini.x = node.x; mini.y = node.y;
    mini.dead = false;
    mini.life = 65 + Math.random() * 60;
    mini.hue = this.hue;
    mini.scale = this.scale || 1;
    mini.flowPhase = Math.random() * TAU;
    mini.flowBias = Math.random() * TAU;
    mini.flowDrift = 0.9 + Math.random() * 1.2;
    mini.spin = (Math.random() - 0.5) * 1.2;
    mini.totalHP = 0;
    // Re-root: detach from parent, drift outward
    node.parent = null;
    mini.nodes = descendants;
    mini.totalHP = descendants.reduce((s, n) => s + n.maxHP, 0);
    // Drift both halves apart from the break point.
    let sepX = node.x - parentNode.x;
    let sepY = node.y - parentNode.y;
    const sepL = Math.hypot(sepX, sepY) || 1;
    sepX /= sepL;
    sepY /= sepL;

    const splitPush = 58 + Math.random() * 38;
    for (const n of mini.nodes) {
      n.vx += sepX * splitPush;
      n.vy += sepY * splitPush;
    }
    const remainPush = splitPush * 0.7;
    for (const n of this.nodes) {
      n.vx -= sepX * remainPush;
      n.vy -= sepY * remainPush;
    }

    // Give all nodes an outward velocity from impact
    const outSpd = 65 + Math.random() * 55;
    const outA = Math.atan2(impactVy, impactVx) + Math.PI + (Math.random() - 0.5) * 0.8;
    for (const n of mini.nodes) {
      n.vx += Math.cos(outA) * outSpd;
      n.vy += Math.sin(outA) * outSpd;
    }
    if (game.plants.length < T.PLANT_CAP * 2) game.plants.push(mini);
    if (this.nodes.length < 2) this.dead = true;
  }

  // Returns energy gained when a herbivore eats from nearest node
  eatFrom(ex, ey, eaterR, game, minChunk = 0, impactVx = 0, impactVy = 0) {
    let best = null, bestD2 = Infinity;
    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.r < minChunk) continue;
      const d2 = dist2(ex, ey, n.x, n.y);
      if (d2 < bestD2) { bestD2 = d2; best = n; }
    }
    if (!best) return 0;
    const d = Math.sqrt(bestD2);
    if (d > eaterR + best.r + 12) return 0;
    const bite = Math.min(best.hp, 4);
    best.hp -= bite;
    game.particles.burst(best.x, best.y, 3, { speed: 30, life: 0.4, r: 1.4, h: this.hue, s: 70, l: 65 });
    if (best.hp <= 0) {
      if (!best.parent) {
        best.dead = true;
      } else {
        this._breakOff(best, impactVx, impactVy, game);
      }
      this.nodes = this.nodes.filter(n => !n.dead);
      if (this.nodes.length < 2) this.dead = true;
    }
    return bite * 3.5;
  }

  draw(ctx, camX, camY, w, h) {
    const T_now = performance.now() * 0.001;
    const ox = -camX + w * 0.5;
    const oy = -camY + h * 0.5;
    const fade = Math.min(1, this.life / 8);

    // stems
    ctx.strokeStyle = hslaCSS(this.hue - 20, 50, 35, 0.7 * fade);
    ctx.lineWidth = 1.5;
    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const p = n.parent;
      if (!p) continue;
      ctx.beginPath();
      ctx.moveTo(p.x + ox, p.y + oy);
      ctx.lineTo(n.x + ox, n.y + oy);
      ctx.stroke();
    }

    // nodes (leaves)
    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const sx = n.x + ox, sy = n.y + oy;
      const pulse = 0.85 + 0.15 * Math.sin(T_now * 2 + i * 1.3);
      const hpFrac = n.hp / n.maxHP;
      const glow = n.r * 2.5;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glow);
      grad.addColorStop(0, hslaCSS(this.hue, 70, 70, 0.45 * fade * pulse));
      grad.addColorStop(1, hslaCSS(this.hue, 70, 55, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(sx, sy, glow, 0, TAU); ctx.fill();
      ctx.fillStyle = hslaCSS(this.hue, 65, 55 + hpFrac * 15, 0.85 * fade);
      ctx.beginPath(); ctx.arc(sx, sy, n.r * pulse, 0, TAU); ctx.fill();
    }
  }
}

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
    ctx.beginPath();
    for (let i = 0; i < this.verts.length; i++) {
      const v = this.verts[i];
      const x = Math.cos(v.a) * v.r, y = Math.sin(v.a) * v.r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // rock fill with subtle gradient
    const grad = ctx.createRadialGradient(-this.r * 0.2, -this.r * 0.2, 0, 0, 0, this.maxR);
    grad.addColorStop(0, hslaCSS(this.hue, 14, this.light + 14, 1));
    grad.addColorStop(1, hslaCSS(this.hue, 9, this.light, 1));
    ctx.fillStyle = grad;
    ctx.fill();

    // bioluminescent rim glow
    ctx.strokeStyle = hslaCSS(this.hue + 40, 60, 65, 0.22);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // crevice shadow
    const cv = this.verts.reduce((best, v) => v.r < best.r ? v : best, this.verts[0]);
    const cx2 = Math.cos(cv.a) * cv.r, cy2 = Math.sin(cv.a) * cv.r;
    const cg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, this.r * 0.4);
    cg.addColorStop(0, 'rgba(0,0,0,0.55)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx2, cy2, this.r * 0.4, 0, TAU); ctx.fill();

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
    this.hazardT = 4;
    this.plantT = 6 + rng() * 6;
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
      this.spawnCreatureNear(player);
      this.spawnT = 0.7 + this.rng() * 0.6;
    }

    // Ensure there is periodic large predator presence around the player.
    this.apexPressureT -= dt;
    if (this.apexPressureT <= 0 && this.game.creatures.filter(c => !c.dead).length < T.CREATURE_CAP) {
      this.spawnApexNear(player);
      this.apexPressureT = 22 + this.rng() * 16;
    }

    // plant clusters — spawn near bloom/current/forest biomes
    this.plantT -= dt;
    if (this.plantT <= 0 && this.game.plants.length < T.PLANT_CAP) {
      const biome = biomeAt(Math.hypot(player.x, player.y));
      if (['bloom', 'current', 'forest'].includes(biome.id)) {
        const a = this.rng() * TAU;
        const minD = Math.max(420, this.game.getSpawnExclusionRadius() + 120);
        const maxD = minD + 900;
        const d = minD + this.rng() * (maxD - minD);
        const px = player.x + Math.cos(a) * d;
        const py = player.y + Math.sin(a) * d;
        const safe = this.game.findSafeSpawnPoint(px, py, 120, 10, 18, this.game.getSpawnExclusionRadius());
        if (safe) {
          const scale = clamp(this.game.getOutwardScaleAt(safe.x, safe.y), 1, 10);
          this.game.plants.push(new PlantCluster(safe.x, safe.y, this.rng, scale));
        }
      }
      this.plantT = 8 + this.rng() * 10;
    }

    // hazards
    this.hazardT -= dt;
    if (this.hazardT <= 0 && this.game.hazards.length < T.HAZARD_CAP) {
      this.maybeSpawnHazard(player);
      this.hazardT = 3 + this.rng() * 4.5;
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

  spawnCreatureNear(player, minRingAway = 5) {
    const a = this.rng() * TAU;
    const ringSize = RING_SIZE;
    const minD = minRingAway <= 0 ? 260 : Math.max(180, minRingAway * ringSize, this.game.getRenderRadius() + 260);
    const maxD = minRingAway <= 0 ? 1000 : Math.max(minD + 300, T.SPAWN_RADIUS + 900);
    const d = minD + this.rng() * (maxD - minD);
    let x = player.x + Math.cos(a) * d;
    let y = player.y + Math.sin(a) * d;
    const local = biomeAt(Math.hypot(x, y));
    const ring = Math.max(1, Math.floor(Math.hypot(x, y) / RING_SIZE) + 1);
    const pool = local.creatureTemplates.slice();
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

  maybeSpawnHazard(player) {
    const biome = biomeAt(Math.hypot(player.x, player.y));
    let type;
    if (biome.id === 'vent') type = this.rng() < 0.6 ? 'vent' : 'toxic';
    else if (biome.id === 'abyss') type = this.rng() < 0.5 ? 'deadzone' : 'toxic';
    else if (biome.id === 'forest') type = this.rng() < 0.35 ? 'toxic' : this.rng() < 0.7 ? 'spine_weed' : this.rng() < 0.82 ? 'current' : 'curl_weed';
    else if (biome.id === 'current') type = this.rng() < 0.48 ? 'current' : this.rng() < 0.76 ? 'spine_weed' : 'curl_weed';
    else if (biome.id === 'bloom') type = this.rng() < 0.62 ? 'spine_weed' : 'curl_weed';
    else return;
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
        desc = 'Green structures rapidly branch through the zone.';
        for (let i = 0; i < 8; i++) {
          const a = this.rng() * TAU, d = 200 + this.rng() * 800;
          const safe = this.game.findSafeSpawnPoint(player.x + Math.cos(a) * d, player.y + Math.sin(a) * d, 120, 8, 16, this.game.getSpawnExclusionRadius());
          if (safe && this.game.plants.length < T.PLANT_CAP * 2) {
            const scale = clamp(this.game.getOutwardScaleAt(safe.x, safe.y), 1, 10);
            this.game.plants.push(new PlantCluster(safe.x, safe.y, this.rng, scale));
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

  showPauseSettings(on) {
    if (!this.el.pauseSettingsPanel) return;
    this.el.pauseSettingsPanel.style.display = on ? 'block' : 'none';
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
    this._scratch = [];
    this.lastBiomeId = null;
    this.codexRecent = '';
    this.gameOver = false;
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

    // Initial load exception: seed nearby plants so ecology is visible immediately.
    for (let i = 0; i < 6; i++) {
      const a = this.rng() * TAU;
      const d = 620 + this.rng() * 980;
      let safe = this.findSafeSpawnPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 140, 12, 14, 520);
      if (!safe) {
        safe = this.findSafeSpawnPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 260, 18, 6, 420);
      }
      if (safe) {
        const scale = clamp(this.getOutwardScaleAt(safe.x, safe.y), 1, 10);
        this.plants.push(new PlantCluster(safe.x, safe.y, this.rng, scale));
      }
    }
    if (this.plants.length < 3) {
      for (let i = this.plants.length; i < 3; i++) {
        let placed = false;
        for (let t = 0; t < 24 && !placed; t++) {
          const a = this.rng() * TAU;
          const d = 520 + this.rng() * 780;
          const px = this.player.x + Math.cos(a) * d;
          const py = this.player.y + Math.sin(a) * d;
          if (!this.isInsideRock(px, py, 4) && Math.hypot(px - this.player.x, py - this.player.y) >= 420) {
            const scale = clamp(this.getOutwardScaleAt(px, py), 1, 10);
            this.plants.push(new PlantCluster(px, py, this.rng, scale));
            placed = true;
          }
        }
      }
    }

    // Surface at least one of each slow-plant hazard near the start area.
    for (const type of ['spine_weed', 'curl_weed']) {
      const a = this.rng() * TAU;
      const d = 360 + this.rng() * 260;
      const hx = this.player.x + Math.cos(a) * d;
      const hy = this.player.y + Math.sin(a) * d;
      const safeH = this.findSafeSpawnPoint(hx, hy, 120, 12, 18, 260);
      if (safeH) this.hazards.push(new Hazard(safeH.x, safeH.y, type));
    }

    if (!this._loopBound) {
      this._loopBound = (t) => this.loop(t);
      requestAnimationFrame(this._loopBound);
    }
  }

  setPaused(p) {
    this.paused = p;
    this.ui.showPause(p);
    if (!p) this.ui.showPauseSettings(false);
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
    if (Input.scrollDelta !== 0) {
      this.zoom = clamp(this.zoom * (1 - Input.scrollDelta * 0.0008), 0.3, 2.5);
      Input.scrollDelta = 0;
    }
    if (this.paused || this.mutationActive || this.milestoneActive) { this.draw(); return; }
    if (this.gameOver) { this.draw(); return; }

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

    // physical separation to avoid overlap jitter and improve body collisions.
    this.resolveCreatureBodyCollisions();

    // foods drift
    for (let i = 0; i < this.foods.length; i++) this.foods[i].update(dt);
    this.resolvePlantFoodChains(dt);

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
        const gain = pl.eatFrom(this.player.x, this.player.y, this.player.r, this, minPlantChunk, this.player.vx, this.player.vy);
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

    // rock collision — push all entities (multi-pass to resolve deeper overlaps cleanly)
    for (let pass = 0; pass < 2; pass++) {
      for (const rock of this.rocks) {
        rock.pushOut(p);
        const nearby = this.grid.query(rock.x, rock.y, rock.maxR + 260, this._scratch);
        for (const e of nearby) {
          if (e.kind === 'creature' && !e.dead) rock.pushOut(e);
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
    const despawnR = Math.max(T.DESPAWN_RADIUS, this.getActiveRadius() + 650);
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
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (e.kind === 'food' && !e.dead) {
        if (d < p.r + e.r) {
          // diet gate for meat
          if (e.type === 'meat' && p.diet === 'herbivore') continue;
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
        const overlap = p.r + e.r * 0.85 - d;
        if (overlap > 0) {
          const canEat = p.r > e.r * 1.05;
          if (canEat) {
            if (p.diet === 'herbivore') {
              // herbivores don't attack prey; bounce by size
              this.applyBodyBounce(p, e, overlap, 0.05);
              continue;
            }
            // start timed eat-kill
            const sizeRatio = e.r / Math.max(4, p.r);
            const eatDur = Math.max(0.2, sizeRatio * 1.2);
            const before = e.hp;
            e.takeDamage(p.biteDamage, 'player', this);
            const dealt = Math.max(0, before - e.hp);
            this.applyBodyBounce(p, e, overlap, clamp(dealt / 45, 0, 0.65));
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
              p.bumpBiteCD = 0.35;
              if (e.dead) this.consumeCreature(e);
            } else {
              if (p.diet === 'herbivore') p.sayPolite();
              this.applyBodyBounce(p, e, overlap, 0.0);
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

    const f = this.spawnFood(tipX, tipY, 'plant', biomeAt(Math.hypot(tipX, tipY)), 1.2 + Math.random() * 1.2);
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

    const sepA = overlap * (mb / msum) * 0.5;
    const sepB = overlap * (ma / msum) * 0.5;
    a.x -= nx * sepA;
    a.y -= ny * sepA;
    b.x += nx * sepB;
    b.y += ny * sepB;

    // Smooth the response by damping closing normal velocity, then add a softer impulse.
    const relVx = b.vx - a.vx;
    const relVy = b.vy - a.vy;
    const relN = relVx * nx + relVy * ny;
    if (relN < 0) {
      const damp = Math.min(34, -relN * 0.62) * soften;
      a.vx += nx * damp * (mb / msum);
      a.vy += ny * damp * (mb / msum);
      b.vx -= nx * damp * (ma / msum);
      b.vy -= ny * damp * (ma / msum);
    }

    const impulse = (16 + overlap * 0.95) * soften;
    a.vx -= nx * impulse * (mb / msum);
    a.vy -= ny * impulse * (mb / msum);
    b.vx += nx * impulse * (ma / msum);
    b.vy += ny * impulse * (ma / msum);

    const tangentialDamp = 0.962;
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
        const minD = a.r * 0.78 + b.r * 0.78;
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
      }

      if (c.diet === 'herbivore' || c.diet === 'omnivore') {
        for (const pl of this.plants) {
          if (pl.dead) continue;
          const d2 = dist2(c.x, c.y, pl.x, pl.y);
          if (d2 > 280 * 280) continue;
          const gain = pl.eatFrom(c.x, c.y, c.r, this, minChunk, c.vx, c.vy);
          if (gain > 0) {
            c.hunger = Math.max(0, c.hunger - gain * 0.03 * dt * 8);
            c.hp = Math.min(c.maxHP, c.hp + gain * 0.02 * dt * 8);
            c.eatenMark = Math.min(1.2, c.eatenMark + 0.5);
            c.growBy(gain * 0.9, this);
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

  findFoodTargetForCreature(creature, r, groupMode = false) {
    if (!creature) return null;
    if (creature.diet === 'carnivore') {
      return this.findSafeFoodForCreature(creature, r) || this.findFood(creature.x, creature.y, r * 0.8, creature, false);
    }

    if (creature.diet === 'herbivore') {
      return this.findPlantTargetForCreature(creature, r, groupMode);
    }

    // Omnivores can choose nearest viable source.
    const meat = this.findSafeFoodForCreature(creature, r) || this.findFood(creature.x, creature.y, r * 0.8, creature, false);
    const plant = this.findPlantTargetForCreature(creature, r, groupMode);
    if (!meat) return plant;
    if (!plant) return meat;
    const md2 = dist2(meat.x, meat.y, creature.x, creature.y);
    const pd2 = dist2(plant.x, plant.y, creature.x, creature.y);
    return pd2 < md2 * 1.15 ? plant : meat;
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

    // Spawn "old self" escort creature
    const oldSelf = new Creature(p.x + 20, p.y, CREATURE_TEMPLATES.drifter, {
      rng: this.rng,
      hue: p.creatorHue !== undefined ? p.creatorHue : 195,
      sizeOverride: p.r,
    });
    oldSelf.behavior = 'escort';
    oldSelf.state = 'escort';
    oldSelf.isEscort = true;
    oldSelf.diet = p.diet;
    oldSelf.speciesTag = p.speciesTag;
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

    // foods (under creatures)
    for (let i = 0; i < this.foods.length; i++) this.foods[i].draw(ctx, this.camX, this.camY, w, h);

    // collectible part shards
    for (let i = 0; i < this.partShards.length; i++) this.partShards[i].draw(ctx, this.camX, this.camY, w, h);

    // particles (background layer)
    this.particles.draw(ctx, this.camX, this.camY, w, h);

    // creatures
    for (let i = 0; i < this.creatures.length; i++) this.creatures[i].draw(ctx, this.camX, this.camY, w, h);

    // player
    if (p) p.draw(ctx, this.camX, this.camY, w, h);

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
    // procedural dust grid with parallax
    const cell = 120;
    const px = -this.camX * 0.4;
    const py = -this.camY * 0.4;
    const startX = Math.floor((-px) / cell) - 1;
    const startY = Math.floor((-py) / cell) - 1;
    const cols = Math.ceil(w / cell) + 3;
    const rows = Math.ceil(h / cell) + 3;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cx = startX + gx;
        const cy = startY + gy;
        const seed = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
        const r = (seed % 1000) / 1000;
        if (r < 0.6) continue;
        const ox = ((seed >> 3) % 1000) / 1000 * cell;
        const oy = ((seed >> 11) % 1000) / 1000 * cell;
        const sx = px + cx * cell + ox;
        const sy = py + cy * cell + oy;
        if (sx < -5 || sy < -5 || sx > w + 5 || sy > h + 5) continue;
        const size = ((seed >> 17) % 100) / 100 * 1.4 + 0.3;
        ctx.fillStyle = hslaCSS(200, 30, 80, 0.15 + 0.18 * r);
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
