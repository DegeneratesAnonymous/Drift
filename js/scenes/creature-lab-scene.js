window.DriftCreatureLab = {
  canvas:   null,
  ctx:      null,
  playerCreature: null,
  creatures: [],
  food:      [],
  lastTime:  0,
  mouse:     { x: 0, y: 0, down: false, seen: false },
  editingParts: false,
  selectedPartIndex: 0,
  running:   false,

  // Input state
  keys:        {},       // currently held keys (e.key → true)
  _actionEdge: { space: false, e: false, q: false },  // pressed-this-frame flags
  _lastShift:  false,
  _dashCooldown: 0,

  // Simulation state
  paused:      false,
  showDevMenu: false
};

// ─── Init ─────────────────────────────────────────────────────────────────────

window.DriftCreatureLab.init = function (canvasId) {
  var lab = window.DriftCreatureLab;

  lab.canvas = document.getElementById(canvasId);
  if (!lab.canvas) {
    console.error("Creature Lab: canvas not found:", canvasId);
    return;
  }
  lab.ctx = lab.canvas.getContext("2d");

  lab.resize();
  window.addEventListener("resize", lab.resize.bind(lab));

  lab.canvas.addEventListener("mousemove", function (e) {
    var rect = lab.canvas.getBoundingClientRect();
    lab.mouse.x = (e.clientX - rect.left) * (lab.canvas.width  / rect.width);
    lab.mouse.y = (e.clientY - rect.top)  * (lab.canvas.height / rect.height);
    lab.mouse.seen = true;
    lab.editingParts = !!e.altKey;
  });
  lab.canvas.addEventListener("mousedown", function (e) {
    lab.mouse.down = true;
    lab.editingParts = !!e.altKey;
    if (lab.editingParts && lab.playerCreature && lab.playerCreature.parts.length > 0) {
      var idx = dcLabNearestPartIndex(lab.playerCreature, lab.mouse.x, lab.mouse.y);
      if (idx >= 0) lab.selectedPartIndex = idx;
    }
  });
  lab.canvas.addEventListener("mouseup",   function () { lab.mouse.down = false; lab.editingParts = false; });
  window.addEventListener("mouseup",       function () { lab.mouse.down = false; lab.editingParts = false; });

  // ─── Key state tracking ───────────────────────────────────────────────────

  window.addEventListener("keydown", function (e) {
    lab.keys[e.key] = true;

    // Prevent page scroll for movement/action keys
    var noScroll = [' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                    'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'e', 'E', 'q', 'Q'];
    if (noScroll.indexOf(e.key) !== -1) e.preventDefault();

    // Edge-detect action keys (fire once per press)
    if (e.key === ' ')              lab._actionEdge.space = true;
    if (e.key === 'e' || e.key === 'E') lab._actionEdge.e = true;
    if (e.key === 'q' || e.key === 'Q') lab._actionEdge.q = true;

    var D = window.DriftCreatures;
    switch (e.key) {
      case 'Escape':
        lab.paused = !lab.paused;
        break;
      case '`':
        lab.showDevMenu = !lab.showDevMenu;
        break;
      case 'c': case 'C':
        // Toggle colorblind mode
        D.settings.colorblindMode = !D.settings.colorblindMode;
        break;
      case 'r': case 'R': lab.randomize(); break;
      case 'g': case 'G':
        for (var i = 0; i < lab.creatures.length; i++) {
          D.queueBodyGrowth(lab.creatures[i].growth, 0.15);
        }
        break;
      case 'f': case 'F': lab.spawnFood(); break;
      case '1': D.debug.creaturePhysics     = !D.debug.creaturePhysics;     break;
      case '2': D.debug.creatureConstraints = !D.debug.creatureConstraints; break;
      case '3': D.debug.creatureAI          = !D.debug.creatureAI;          break;
      case '4': D.debug.creatureGrowth      = !D.debug.creatureGrowth;      break;
      case '[':
        if (lab.playerCreature && lab.playerCreature.parts.length) {
          lab.selectedPartIndex = (lab.selectedPartIndex - 1 + lab.playerCreature.parts.length) % lab.playerCreature.parts.length;
        }
        break;
      case ']':
        if (lab.playerCreature && lab.playerCreature.parts.length) {
          lab.selectedPartIndex = (lab.selectedPartIndex + 1) % lab.playerCreature.parts.length;
        }
        break;
    }
  });

  window.addEventListener("keyup", function (e) {
    delete lab.keys[e.key];
  });

  window.addEventListener("blur", function () {
    lab.keys = {};
  });

  lab.randomize();
  lab.running  = true;
  lab.lastTime = performance.now();
  requestAnimationFrame(lab.loop);
};

// ─── Resize ───────────────────────────────────────────────────────────────────

window.DriftCreatureLab.resize = function () {
  var lab = window.DriftCreatureLab;
  if (!lab.canvas) return;
  lab.canvas.width  = lab.canvas.clientWidth  || window.innerWidth;
  lab.canvas.height = lab.canvas.clientHeight || window.innerHeight;
};

// ─── Randomize ────────────────────────────────────────────────────────────────

window.DriftCreatureLab.randomize = function () {
  var lab = window.DriftCreatureLab;
  var D   = window.DriftCreatures;
  var now = Date.now();

  lab.creatures = [];
  lab.food      = [];

  var w  = lab.canvas.width;
  var h  = lab.canvas.height;
  var cx = w / 2;
  var cy = h / 2;
  lab.mouse.x = cx;
  lab.mouse.y = cy;

  // Main (mouse-controlled) creature at centre
  lab.playerCreature = D.createCreature(now % 999983, cx, cy, 1).setPlayerControlled();
  lab.creatures.push(lab.playerCreature);

  // Scatter 7 more around the canvas
  for (var i = 0; i < 7; i++) {
    var seed = (now + i * 137331) % 999983;
    var tier = 1 + Math.floor(Math.random() * 3);  // tiers 1-3
    var px   = 60 + Math.random() * (w - 120);
    var py   = 60 + Math.random() * (h - 120);
    lab.creatures.push(D.createCreature(seed, px, py, tier));
  }

  lab.spawnFood();
};

// ─── Spawn food ───────────────────────────────────────────────────────────────

window.DriftCreatureLab.spawnFood = function () {
  var lab = window.DriftCreatureLab;
  var w   = lab.canvas.width;
  var h   = lab.canvas.height;

  for (var i = 0; i < 6; i++) {
    var spawn = dcLabFindFoodSpawn(w, h, lab.creatures);
    lab.food.push({
      x:     spawn.x,
      y:     spawn.y,
      value: 0.01 + Math.random() * 0.02
    });
  }
};

// ─── Main loop ────────────────────────────────────────────────────────────────

window.DriftCreatureLab.loop = function (now) {
  var lab = window.DriftCreatureLab;
  if (!lab.running) return;

  var dt = Math.min((now - lab.lastTime) / 1000, 0.05);
  lab.lastTime = now;

  var ctx = lab.ctx;
  var w   = lab.canvas.width;
  var h   = lab.canvas.height;
  var D   = window.DriftCreatures;

  // ─── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = "#071018";
  ctx.fillRect(0, 0, w, h);

  // ─── Pause overlay (skip all updates) ────────────────────────────────────────
  if (lab.paused) {
    // Still render creatures at last positions
    for (var ri = 0; ri < lab.creatures.length; ri++) {
      lab.creatures[ri].render(ctx);
    }
    // Dim overlay
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle    = "#fff4a3";
    ctx.strokeStyle  = "#1a1024";
    ctx.lineWidth    = 4;
    ctx.font         = "bold 36px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText("PAUSED", w * 0.5, h * 0.5);
    ctx.fillText("PAUSED", w * 0.5, h * 0.5);
    ctx.font      = "14px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("ESC to resume", w * 0.5, h * 0.5 + 34);
    ctx.restore();
    requestAnimationFrame(lab.loop);
    return;
  }

  // ─── Dash cooldown tick ───────────────────────────────────────────────────────
  lab._dashCooldown = Math.max(0, (lab._dashCooldown || 0) - dt);

  // ─── Build keyboard movement target ──────────────────────────────────────────
  var kbInputTarget = null;
  if (lab.playerCreature) {
    var _kx = 0, _ky = 0;
    if (lab.keys['ArrowLeft']  || lab.keys['a'] || lab.keys['A']) _kx -= 1;
    if (lab.keys['ArrowRight'] || lab.keys['d'] || lab.keys['D']) _kx += 1;
    if (lab.keys['ArrowUp']    || lab.keys['w'] || lab.keys['W']) _ky -= 1;
    if (lab.keys['ArrowDown']  || lab.keys['s'] || lab.keys['S']) _ky += 1;
    var _km = Math.sqrt(_kx * _kx + _ky * _ky);
    if (_km > 0.001) {
      _kx /= _km; _ky /= _km;
      var _pc0 = D.getBodyCenter(lab.playerCreature.body);
      kbInputTarget = { x: _pc0.x + _kx * 400, y: _pc0.y + _ky * 400 };
    }
  }

  // ─── Dash (Shift edge) ────────────────────────────────────────────────────────
  var _shiftNow = !!(lab.keys['Shift'] || lab.keys['ShiftLeft'] || lab.keys['ShiftRight']);
  if (_shiftNow && !lab._lastShift && lab._dashCooldown <= 0 && lab.playerCreature) {
    var _dfx = lab.playerCreature.facing.x || 1;
    var _dfy = lab.playerCreature.facing.y || 0;
    D.applyForceToBody(lab.playerCreature.body, _dfx * 9.5, _dfy * 9.5);
    lab._dashCooldown = 0.55;
  }
  lab._lastShift = _shiftNow;

  // ─── Update world ─────────────────────────────────────────────────────────────
  var world = { food: lab.food, creatures: lab.creatures };

  if (lab.mouse.down && lab.editingParts && lab.playerCreature && lab.playerCreature.parts.length) {
    D.setPartPlacementFromWorld(lab.playerCreature, lab.selectedPartIndex, lab.mouse.x, lab.mouse.y);
  }

  for (var ci = 0; ci < lab.creatures.length; ci++) {
    var canSteer = !lab.editingParts;
    var inputTarget = null;
    if (lab.creatures[ci] === lab.playerCreature && canSteer) {
      // Keyboard takes priority over mouse
      if (kbInputTarget) {
        inputTarget = kbInputTarget;
      } else if (lab.mouse.down || lab.mouse.seen) {
        inputTarget = lab.mouse;
      }
    }
    lab.creatures[ci].update(dt, world, inputTarget);
  }

  D.resolveCreatureCollisions(lab.creatures, 2);

  dcLabEatNearbyFood(lab.creatures, lab.food, D);
  dcLabWallBounce(lab.creatures, w, h);

  // ─── Compute action ranges ────────────────────────────────────────────────────
  if (lab.playerCreature) {
    var _pCenter = D.getBodyCenter(lab.playerCreature.body);
    var _pSize   = lab.playerCreature.getApproxSize();
    for (var _ci = 0; _ci < lab.creatures.length; _ci++) {
      var _other = lab.creatures[_ci];
      if (_other === lab.playerCreature) { _other._actionFlags = null; continue; }
      var _oc   = D.getBodyCenter(_other.body);
      var _dist = Math.sqrt(
        (_oc.x - _pCenter.x) * (_oc.x - _pCenter.x) +
        (_oc.y - _pCenter.y) * (_oc.y - _pCenter.y)
      );
      var spaceR = _pSize * 2.5 + 45;
      var eR     = _pSize * 3.5 + 65;
      var qR     = _pSize * 4.5 + 80;
      var _af = {
        space: _dist < spaceR,
        e:     _dist < eR,
        q:     _dist < qR
      };
      _other._actionFlags = (_af.space || _af.e || _af.q) ? _af : null;
    }
  }

  // ─── Trigger actions on key press (edge) ─────────────────────────────────────
  if (lab.playerCreature && (lab._actionEdge.space || lab._actionEdge.e || lab._actionEdge.q)) {
    var _pCen = D.getBodyCenter(lab.playerCreature.body);
    var _pFx  = lab.playerCreature.facing.x || 1;
    var _pFy  = lab.playerCreature.facing.y || 0;

    // Find nearest in-range creature for targeted actions
    var _tgt = null, _tgtDist = Infinity;
    for (var _ti = 0; _ti < lab.creatures.length; _ti++) {
      var _tc = lab.creatures[_ti];
      if (_tc === lab.playerCreature || !_tc._actionFlags) continue;
      var _tcen = D.getBodyCenter(_tc.body);
      var _td   = Math.sqrt((_tcen.x - _pCen.x)*(_tcen.x - _pCen.x) + (_tcen.y - _pCen.y)*(_tcen.y - _pCen.y));
      if (_td < _tgtDist) { _tgtDist = _td; _tgt = _tc; }
    }

    if (lab._actionEdge.space && _tgt && _tgt._actionFlags && _tgt._actionFlags.space) {
      // Space — Attack: hit flash + knockback
      _tgt.hitFlash = 1.0;
      var _kbCenter = D.getBodyCenter(_tgt.body);
      var _kbX = _kbCenter.x - _pCen.x;
      var _kbY = _kbCenter.y - _pCen.y;
      var _kbLen = Math.sqrt(_kbX * _kbX + _kbY * _kbY) || 1;
      D.applyForceToBody(_tgt.body, (_kbX / _kbLen) * 5.0, (_kbY / _kbLen) * 5.0);
    }
    if (lab._actionEdge.e && _tgt && _tgt._actionFlags && _tgt._actionFlags.e) {
      // E — Interact: soothe the target creature
      _tgt.mood      = 'calm';
      _tgt.behavior  = 'wander';
      _tgt.eatenMark = 0.6;
    }
    if (lab._actionEdge.q) {
      // Q — Ability: forward surge for the player
      D.applyForceToBody(lab.playerCreature.body, _pFx * 4.0, _pFy * 4.0);
    }
  }
  // Clear action edges after processing
  lab._actionEdge.space = false;
  lab._actionEdge.e     = false;
  lab._actionEdge.q     = false;

  // Auto-respawn food
  if (lab.food.length < 4) lab.spawnFood();

  // ─── Render food ──────────────────────────────────────────────────────────────
  for (var fi = 0; fi < lab.food.length; fi++) {
    var f = lab.food[fi];
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.x, f.y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = "#8ff0a4";
    ctx.shadowColor = "#8ff0a4";
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.restore();
  }

  // ─── Render creatures ─────────────────────────────────────────────────────────
  for (var ri = 0; ri < lab.creatures.length; ri++) {
    lab.creatures[ri].render(ctx);
    var dbg = D.debug;
    if (dbg && (dbg.creaturePhysics || dbg.creatureConstraints || dbg.creatureAI || dbg.creatureGrowth)) {
      D.renderCreatureDebug(ctx, lab.creatures[ri]);
    }
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────────
  var colorblind = D.settings && D.settings.colorblindMode;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.30)";
  ctx.font      = "12px monospace";
  ctx.fillText("WASD/Arrows = move  |  Shift = dash  |  Space = attack  |  E = interact  |  Q = ability", 10, 18);
  ctx.fillText("Mouse = steer  |  Alt+drag = place part  |  [ ] = cycle part  |  Esc = pause  |  ` = dev  |  C = colorblind", 10, 34);
  ctx.fillText(lab.creatures.length + " creatures  " + lab.food.length + " food" +
    (lab._dashCooldown > 0 ? "  dash: " + lab._dashCooldown.toFixed(1) + "s" : "") +
    (colorblind ? "  [COLORBLIND]" : ""), 10, 50);
  if (lab.playerCreature && lab.playerCreature.parts.length) {
    var _hp = lab.playerCreature.parts[lab.selectedPartIndex % lab.playerCreature.parts.length];
    ctx.fillText("selected part: #" + lab.selectedPartIndex + "  " + (_hp ? _hp.type : "none"), 10, 66);
  }

  // Action key legend
  var eLegend = [
    { label: "SP", fill: colorblind ? "#FFEE00" : "#FFE135", desc: "Attack"   },
    { label: "E",  fill: colorblind ? "#4488FF" : "#FF4444", desc: "Interact" },
    { label: "Q",  fill: colorblind ? "#CC44FF" : "#FF8800", desc: "Ability"  }
  ];
  var lx = w - 10;
  ctx.textAlign = "right";
  for (var li = 0; li < eLegend.length; li++) {
    var ly = 18 + li * 18;
    ctx.fillStyle = eLegend[li].fill;
    ctx.font      = "bold 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("[" + eLegend[li].label + "] " + eLegend[li].desc, lx, ly);
  }
  ctx.restore();

  // ─── Dev menu overlay ─────────────────────────────────────────────────────────
  if (lab.showDevMenu) {
    var D2 = window.DriftCreatures;
    ctx.save();
    ctx.fillStyle = "rgba(10,5,20,0.82)";
    ctx.fillRect(10, h - 130, 320, 120);
    ctx.fillStyle = "#fff4a3";
    ctx.font      = "bold 13px monospace";
    ctx.textAlign = "left";
    ctx.fillText("── DEV MENU (` to close) ──", 20, h - 110);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font      = "11px monospace";
    var dbg = D2.debug || {};
    ctx.fillText("[1] Physics debug:     " + (dbg.creaturePhysics     ? "ON" : "off"), 20, h - 92);
    ctx.fillText("[2] Constraints debug: " + (dbg.creatureConstraints ? "ON" : "off"), 20, h - 77);
    ctx.fillText("[3] AI debug:          " + (dbg.creatureAI          ? "ON" : "off"), 20, h - 62);
    ctx.fillText("[4] Growth debug:      " + (dbg.creatureGrowth      ? "ON" : "off"), 20, h - 47);
    ctx.fillText("[R] Randomize  [G] Grow  [F] Spawn food  [C] Colorblind: " + (colorblind ? "ON" : "off"), 20, h - 32);
    ctx.restore();
  }

  requestAnimationFrame(lab.loop);
};

// ─── Helpers (module-private) ─────────────────────────────────────────────────

function dcLabEatNearbyFood(creatures, food, D) {
  for (var ci = 0; ci < creatures.length; ci++) {
    var creature = creatures[ci];
    var center   = D.getBodyCenter(creature.body);
    var eatR     = creature.getApproxSize() + 8;

    for (var fi = food.length - 1; fi >= 0; fi--) {
      var f  = food[fi];
      var dx = f.x - center.x;
      var dy = f.y - center.y;
      if (dx * dx + dy * dy < eatR * eatR) {
        food.splice(fi, 1);
        D.queueBodyGrowth(creature.growth, f.value);
        creature.mood = "feeding";
      }
    }
  }
}

function dcLabWallBounce(creatures, width, height) {
  var D      = window.DriftCreatures;
  var margin = 18;

  for (var ci = 0; ci < creatures.length; ci++) {
    var nodes = creatures[ci].body.nodes;
    for (var ni = 0; ni < nodes.length; ni++) {
      var node = nodes[ni];
      if (node.x < margin) {
        node.x     = margin;
        node.prevX = node.x + (node.prevX - node.x) * -0.5;
      }
      if (node.x > width - margin) {
        node.x     = width - margin;
        node.prevX = node.x + (node.prevX - node.x) * -0.5;
      }
      if (node.y < margin) {
        node.y     = margin;
        node.prevY = node.y + (node.prevY - node.y) * -0.5;
      }
      if (node.y > height - margin) {
        node.y     = height - margin;
        node.prevY = node.y + (node.prevY - node.y) * -0.5;
      }
    }
  }
}

function dcLabFindFoodSpawn(width, height, creatures) {
  var margin = 30;
  var best = null;

  for (var tries = 0; tries < 20; tries++) {
    var candidate = {
      x: margin + Math.random() * (width - margin * 2),
      y: margin + Math.random() * (height - margin * 2)
    };

    var nearest = Infinity;
    for (var ci = 0; ci < creatures.length; ci++) {
      var center = window.DriftCreatures.getBodyCenter(creatures[ci].body);
      var dx = candidate.x - center.x;
      var dy = candidate.y - center.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearest) nearest = dist;
    }

    if (nearest > 80) return candidate;
    if (!best || nearest > best.nearest) {
      best = { x: candidate.x, y: candidate.y, nearest: nearest };
    }
  }

  return best || { x: width * 0.5, y: height * 0.5 };
}

function dcLabNearestPartIndex(creature, x, y) {
  var D = window.DriftCreatures;
  var best = -1;
  var bestD2 = Infinity;
  for (var i = 0; i < creature.parts.length; i++) {
    var anchor = D.resolveCreaturePartAnchor(creature, creature.parts[i]);
    if (!anchor) continue;
    var dx = anchor.x - x;
    var dy = anchor.y - y;
    var d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}
