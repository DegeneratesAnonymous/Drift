window.DriftCreatures = window.DriftCreatures || {};

// Storybook palette + helpers
var DC_INK = "#1a1024";
var DC_INK_SOFT = "rgba(26,16,36,0.85)";

// Global renderer settings (toggled by the scene layer)
window.DriftCreatures.settings = window.DriftCreatures.settings || {
  colorblindMode: false
};

window.DriftCreatures.renderCreature = function (ctx, creature) {
  var D = window.DriftCreatures;
  var body = creature.body;
  var genome = creature.genome;
  var n = body.nodes.length;
  if (n < 3) return;

  var center = D.getBodyCenter(body);
  var approxR = creature.getApproxSize();
  var spineData = D.getProceduralSpine(creature, center, approxR);
  creature._procSpine = spineData;

  // Player aim reticle (kept, but cleaner)
  if (creature.isPlayer) {
    ctx.save();
    ctx.strokeStyle = "#fff4a3";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, approxR * 1.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Top-down drop shadow under the creature
  ctx.save();
  ctx.fillStyle = "rgba(18,8,28,0.28)";
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + approxR * 0.55, approxR * 1.05, approxR * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Speed-scaled bubble wake
  D.renderCreatureWake(ctx, creature, center, approxR);

  // Body silhouette with thick storybook outline
  D.drawProceduralBody(ctx, creature, spineData, genome);

  var debug = D.debug || {};
  if (debug.showSpine) {
    D.renderCreatureSpine(ctx, creature, center, approxR);
  }

  // Hit flash overlay
  if (creature.hitFlash > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, approxR * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,140,140," + Math.min(0.45, creature.hitFlash * 0.45) + ")";
    ctx.fill();
    ctx.restore();
    // Exclamation puff
    if (creature.hitFlash > 0.6) {
      var fx = creature.facing.x || 1, fy = creature.facing.y || 0;
      var ex = center.x - fy * approxR * 0.7 - fx * approxR * 0.2;
      var ey = center.y + fx * approxR * 0.7 - fy * approxR * 0.2 - approxR * 0.9;
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = DC_INK;
      ctx.lineWidth = 2;
      ctx.font = "bold 14px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeText("!", ex, ey);
      ctx.fillText("!", ex, ey);
      ctx.restore();
    }
  }

  // Cute outlined label
  if (creature.isPlayer || creature.label) {
    ctx.save();
    ctx.fillStyle = creature.isPlayer ? "#fff4a3" : "#ffffff";
    ctx.strokeStyle = DC_INK;
    ctx.lineWidth = 3;
    ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    var labelText = creature.label || "You";
    ctx.strokeText(labelText, center.x, center.y - approxR - 12);
    ctx.fillText(labelText, center.x, center.y - approxR - 12);
    ctx.restore();
  }

  for (var pi = 0; pi < creature.parts.length; pi++) {
    var part = creature.parts[pi];
    if (part.growth < 0.05) continue;
    D.renderCreaturePart(ctx, creature, part);
  }

  // Action-available exclamation markers (only on non-player creatures)
  if (!creature.isPlayer) {
    D.renderActionMarkers(ctx, creature, center, approxR);
  }
};

window.DriftCreatures.renderCreatureWake = function (ctx, creature, center, approxR) {
  var src = creature.sourceCreature;
  var vx = src ? (src.vx || 0) : 0;
  var vy = src ? (src.vy || 0) : 0;
  var speed = Math.sqrt(vx * vx + vy * vy);
  var tNow = Number.isFinite(creature.time) ? creature.time : 0;
  var prev = creature._wakePrev;
  var dt = prev && Number.isFinite(prev.t) ? Math.max(0.001, Math.min(0.1, tNow - prev.t)) : 0.016;
  if ((!src || speed < 0.5) && prev) {
    var pdx = center.x - prev.x;
    var pdy = center.y - prev.y;
    speed = Math.sqrt(pdx * pdx + pdy * pdy) / dt;
  }
  creature._wakePrev = { x: center.x, y: center.y, t: tNow };

  var marks = creature._wakeMarks = creature._wakeMarks || [];
  var fx = creature.facing.x || 1;
  var fy = creature.facing.y || 0;
  var sideX = -fy, sideY = fx;

  // Spawn vortex-wake arcs in left/right pairs while moving.
  // They fan outward in a V behind the creature — no bubbles, just water disturbance.
  if (speed > 6) {
    creature._wakeSpawn = (creature._wakeSpawn || 0) + dt;
    var interval = Math.max(0.06, 0.55 - speed * 0.003);
    while (creature._wakeSpawn >= interval && marks.length < 24) {
      creature._wakeSpawn -= interval;
      for (var s = -1; s <= 1; s += 2) {
        var spread  = approxR * (0.26 + Math.random() * 0.14);
        var jitter  = (Math.random() - 0.5) * approxR * 0.10;
        var spawnX  = center.x - fx * approxR * 0.80 + sideX * s * spread + jitter;
        var spawnY  = center.y - fy * approxR * 0.80 + sideY * s * spread + jitter;
        // Drift outward + slightly backward relative to heading
        var dspd = 7 + Math.random() * 6;
        marks.push({
          x:    spawnX,
          y:    spawnY,
          vx:   (sideX * s * 0.55 - fx * 0.28) * dspd,
          vy:   (sideY * s * 0.55 - fy * 0.28) * dspd,
          arc:  Math.atan2(fy, fx) + s * 0.42 + (Math.random() - 0.5) * 0.35,
          r:    approxR * (0.20 + Math.random() * 0.09),
          life: 0,
          ttl:  0.50 + Math.min(0.75, speed / 110) + Math.random() * 0.12,
          side: s
        });
      }
    }
  }

  // Age, drift, and render each mark as a small curved water-disturbance arc.
  for (var i = marks.length - 1; i >= 0; i--) {
    var m = marks[i];
    m.life += dt;
    if (m.life >= m.ttl) { marks.splice(i, 1); continue; }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    var k   = m.life / m.ttl;
    // Fade-in briefly, then fade out
    var alpha = (k < 0.18 ? k / 0.18 : 1 - (k - 0.18) / 0.82) * 0.36;
    // Arc slowly rotates outward as it ages
    var arcAngle = m.arc + k * 0.28 * m.side;
    ctx.save();
    ctx.strokeStyle = 'rgba(150,210,245,' + alpha.toFixed(3) + ')';
    ctx.lineWidth   = Math.max(0.7, approxR * 0.038) * (1 - k * 0.55);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r * (1 + k * 0.35), arcAngle - 0.62, arcAngle + 0.62);
    ctx.stroke();
    ctx.restore();
  }
};

// ─── Action-range exclamation markers ────────────────────────────────────────

window.DriftCreatures.renderActionMarkers = function (ctx, creature, center, approxR) {
  var flags = creature._actionFlags;
  if (!flags) return;

  var colorblind = (window.DriftCreatures.settings || {}).colorblindMode;

  // Default palette: Space=Yellow, E=Red, Q=Orange
  // Colorblind palette:   Space=Yellow, E=Blue, Q=Purple
  var COLORS = colorblind ? [
    { key: 'space', fill: '#FFEE00', stroke: '#665500', label: 'SP' },
    { key: 'e',     fill: '#4488FF', stroke: '#002277', label: 'E'  },
    { key: 'q',     fill: '#CC44FF', stroke: '#550077', label: 'Q'  }
  ] : [
    { key: 'space', fill: '#FFE135', stroke: '#7A5500', label: 'SP' },
    { key: 'e',     fill: '#FF4444', stroke: '#7A0000', label: 'E'  },
    { key: 'q',     fill: '#FF8800', stroke: '#7A3D00', label: 'Q'  }
  ];

  var tNow = Number.isFinite(creature.time) ? creature.time : 0;

  var slots = [];
  for (var si = 0; si < COLORS.length; si++) {
    if (flags[COLORS[si].key]) slots.push(COLORS[si]);
  }
  if (slots.length === 0) return;

  // Arc parameters — markers sit on a curved band above the creature.
  // Centre marker is highest; outer markers dip slightly (smile/rainbow arc).
  var arcR  = 9 + slots.length * 4;
  var span  = slots.length === 1 ? 0 : slots.length === 2 ? 0.42 : 0.68;
  var baseY = center.y - approxR - 18;

  ctx.save();
  ctx.font         = 'bold 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (var i = 0; i < slots.length; i++) {
    var t     = slots.length === 1 ? 0 : (i / (slots.length - 1)) * 2 - 1;
    var theta = t * span;

    var sx = center.x + Math.sin(theta) * arcR;
    var sy = baseY - Math.cos(theta) * arcR + arcR;

    // Independent per-marker wiggle — each bounces up at a different rate/phase
    var phase = i * 1.7;
    var wigX  = Math.sin(tNow * 5.4 + phase) * 1.2;
    // Upward-biased bounce: absolute value gives a sharp upward pop
    var wigY  = -Math.abs(Math.sin(tNow * 6.2 + phase * 0.9)) * 5.0;

    sx += wigX;
    sy += wigY;

    ctx.lineWidth   = 2.5;
    ctx.strokeStyle = slots[i].stroke;
    ctx.strokeText('!', sx, sy);
    ctx.fillStyle   = slots[i].fill;
    ctx.fillText('!', sx, sy);
  }
  ctx.restore();
};

window.DriftCreatures.renderCreaturePart = function (ctx, creature, part) {
  var D = window.DriftCreatures;
  var anchor = D.resolveCreaturePartAnchor(creature, part);
  if (!anchor) return;

  var genome = creature.genome;
  var sz = part.size * Math.min(1, part.growth);
  var t = (part.animTime || 0) + (part.phase || 0) * 3;
  var alpha = Math.min(1, part.growth * 2);
  var variant = part.variation || 0;
  var outPad = 0;
  if (part.type === "eye") outPad = sz * 0.06;
  else if (part.type === "mouth" || part.type === "herbivoreMouth" || part.type === "carnivoreMouth" || part.type === "omnivoreMouth") outPad = sz * 0.02;
  else if (part.type === "fin") outPad = sz * 0.14;
  else if (part.type === "tail") outPad = sz * 0.08;
  else if (part.type === "weapon") outPad = sz * 0.16;
  else if (part.type === "defense") outPad = sz * 0.1;
  else if (part.type === "detail") outPad = sz * 0.07;

  ctx.save();
  ctx.translate(anchor.x + Math.cos(anchor.angle) * outPad, anchor.y + Math.sin(anchor.angle) * outPad);
  ctx.rotate(anchor.angle + (part.angle || 0));
  ctx.globalAlpha *= alpha;

  if (part.type === "eye") dcRenderEyeVariant(ctx, genome, sz, variant, t, creature);
  else if (part.type === "mouth" || part.type === "omnivoreMouth") dcRenderMouthVariant(ctx, genome, sz, variant, t, "omnivore", creature);
  else if (part.type === "herbivoreMouth") dcRenderMouthVariant(ctx, genome, sz, variant, t, "herbivore", creature);
  else if (part.type === "carnivoreMouth") dcRenderMouthVariant(ctx, genome, sz, variant, t, "carnivore", creature);
  else if (part.type === "fin") dcRenderFinVariant(ctx, genome, sz, variant, t, creature);
  else if (part.type === "tail") dcRenderTailVariant(ctx, genome, sz, variant, t, creature);
  else if (part.type === "weapon") dcRenderWeaponVariant(ctx, genome, sz, variant, t, creature);
  else if (part.type === "defense") dcRenderDefenseVariant(ctx, genome, sz, variant, t, creature);
  else if (part.type === "detail") dcRenderDetailVariant(ctx, genome, sz, variant, t, creature);

  ctx.restore();
};

window.DriftCreatures.getCreatureAnchorMap = function (creature) {
  var D = window.DriftCreatures;
  var spine = creature._procSpine || D.getProceduralSpine(creature, D.getBodyCenter(creature.body), creature.getApproxSize());
  var points = spine.points;
  var tangents = spine.tangents;
  var left = spine.left;
  var right = spine.right;
  var radii = spine.radii;
  var n = points.length;

  var idx = function (t) {
    return Math.max(0, Math.min(n - 1, Math.round((n - 1) * t)));
  };

  var headI = idx(1.0);
  var neckI = idx(0.84);
  var chestI = idx(0.68);
  var midI = idx(0.5);
  var hipI = idx(0.3);
  var tailI = idx(0.08);

  var head = points[headI];
  var headT = tangents[headI];
  var center = spine.center;
  var nose = {
    x: head.x + headT.x * radii[headI] * 0.65,
    y: head.y + headT.y * radii[headI] * 0.65,
    angle: Math.atan2(headT.y, headT.x)
  };

  return {
    center: dcAnchorFromPoint(center, center, headT.x, headT.y),
    nose: nose,
    crown: dcAnchorFromPoint(points[neckI], left[neckI], -headT.y, headT.x),
    browLeft: dcAnchorFromPoint(points[neckI], left[neckI], -headT.y, headT.x),
    browRight: dcAnchorFromPoint(points[neckI], right[neckI], headT.y, -headT.x),
    cheekLeft: dcAnchorFromPoint(points[chestI], left[chestI], -tangents[chestI].y, tangents[chestI].x),
    cheekRight: dcAnchorFromPoint(points[chestI], right[chestI], tangents[chestI].y, -tangents[chestI].x),
    flankUpperLeft: dcAnchorFromPoint(points[midI], left[midI], -tangents[midI].y, tangents[midI].x),
    flankUpperRight: dcAnchorFromPoint(points[midI], right[midI], tangents[midI].y, -tangents[midI].x),
    flankLowerLeft: dcAnchorFromPoint(points[hipI], left[hipI], -tangents[hipI].y, tangents[hipI].x),
    flankLowerRight: dcAnchorFromPoint(points[hipI], right[hipI], tangents[hipI].y, -tangents[hipI].x),
    dorsalMid: dcAnchorFromPoint(points[midI], left[midI], -tangents[midI].y, tangents[midI].x),
    tailBase: dcAnchorFromPoint(points[tailI], points[Math.max(0, tailI - 1)], -tangents[tailI].x, -tangents[tailI].y),
    tailKnob: {
      x: points[0].x - tangents[0].x * radii[0] * 0.45,
      y: points[0].y - tangents[0].y * radii[0] * 0.45,
      angle: Math.atan2(-tangents[0].y, -tangents[0].x)
    }
  };
};

window.DriftCreatures.resolveCreaturePartAnchor = function (creature, part) {
  var map = window.DriftCreatures.getCreatureAnchorMap(creature);
  var spine = creature._procSpine || window.DriftCreatures.getProceduralSpine(creature, window.DriftCreatures.getBodyCenter(creature.body), creature.getApproxSize());

  if (part.userPlacement) {
    return dcAnchorFromCustomPlacement(spine, part.userPlacement);
  }

  var role = part.anchorRole;
  if (role && map[role]) return map[role];

  if (part.type === "eye") return part.anchorNode % 2 === 0 ? map.browLeft : map.browRight;
  if (part.type === "mouth" || part.type === "herbivoreMouth" || part.type === "carnivoreMouth" || part.type === "omnivoreMouth") return map.nose;
  if (part.type === "fin") return part.anchorNode % 2 === 0 ? map.flankUpperLeft : map.flankUpperRight;
  if (part.type === "tail") return map.tailBase;
  if (part.type === "weapon") return map.crown;
  if (part.type === "defense") return map.dorsalMid;
  if (part.type === "detail") return part.anchorNode % 2 === 0 ? map.cheekLeft : map.cheekRight;
  return map.center;
};

window.DriftCreatures.renderCreatureSpine = function (ctx, creature, center, approxR) {
  var D = window.DriftCreatures;
  var spine = creature._procSpine || D.getProceduralSpine(creature, center, approxR);
  var points = spine.points;
  var tail = points[0];
  var nose = points[points.length - 1];
  var growthLevel = creature.growthLevel || 0;
  var vertebrae = 4 + growthLevel;
  var lineAlpha = creature.growthPulse ? 0.42 + Math.min(0.22, creature.growthPulse * 0.18) : 0.34;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(nose.x, nose.y);
  ctx.strokeStyle = dcHexToRgba(creature.genome.colors.detail, lineAlpha);
  ctx.lineWidth = Math.max(1.1, approxR * 0.06);
  ctx.stroke();

  for (var i = 0; i < vertebrae; i++) {
    var t = vertebrae === 1 ? 0.5 : i / (vertebrae - 1);
    var x = tail.x + (nose.x - tail.x) * t;
    var y = tail.y + (nose.y - tail.y) * t;
    var r = approxR * (0.12 - t * 0.04) * (1 + Math.sin(creature.time * 5 + i * 0.8) * 0.04);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.4, r), 0, Math.PI * 2);
    ctx.fillStyle = dcHexToRgba(creature.genome.colors.accent, 0.34 + (1 - t) * 0.14);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.8, r * 0.4), 0, Math.PI * 2);
    ctx.fillStyle = dcHexToRgba(creature.genome.colors.detail, 0.35 + t * 0.15);
    ctx.fill();
  }
  ctx.restore();
};

function dcSupportPoint(body, dirX, dirY) {
  var center = window.DriftCreatures.getBodyCenter(body);
  var len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  var nx = dirX / len;
  var ny = dirY / len;
  var best = null;
  var bestDot = -Infinity;
  for (var i = 0; i < body.nodes.length; i++) {
    var node = body.nodes[i];
    var dot = (node.x - center.x) * nx + (node.y - center.y) * ny;
    if (dot > bestDot) {
      bestDot = dot;
      best = node;
    }
  }
  if (!best) return { x: center.x, y: center.y, angle: Math.atan2(ny, nx) };
  return { x: best.x, y: best.y, angle: Math.atan2(best.y - center.y, best.x - center.x) };
}

window.DriftCreatures.getProceduralSpine = function (creature, center, approxR) {
  var nodes = creature.body.nodes;
  var rawFx = creature.facing.x || 1;
  var rawFy = creature.facing.y || 0;
  var rawLen = Math.sqrt(rawFx * rawFx + rawFy * rawFy) || 1;
  rawFx /= rawLen;
  rawFy /= rawLen;
  var prevFacing = creature._renderFacing || { x: rawFx, y: rawFy };
  // Heavier smoothing damps heading noise from rapid turn updates.
  var facingSmooth = creature.isPlayer ? 0.955 : 0.945;
  var fx = prevFacing.x * facingSmooth + rawFx * (1 - facingSmooth);
  var fy = prevFacing.y * facingSmooth + rawFy * (1 - facingSmooth);
  var flen = Math.sqrt(fx * fx + fy * fy) || 1;
  fx /= flen;
  fy /= flen;
  creature._renderFacing = { x: fx, y: fy };
  var sx = -fy;
  var sy = fx;

  var minS = Infinity;
  var maxS = -Infinity;
  var samples = [];
  for (var i = 0; i < nodes.length; i++) {
    var dx = nodes[i].x - center.x;
    var dy = nodes[i].y - center.y;
    var s = dx * fx + dy * fy;
    var l = dx * sx + dy * sy;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
    samples.push({ s: s, l: l });
  }

  var segCount = Math.max(7, Math.min(13, Math.round(nodes.length * 0.72)));
  var points = [];
  var radii = [];
  var range = Math.max(4, maxS - minS);

  for (var si = 0; si < segCount; si++) {
    var t = segCount <= 1 ? 0 : si / (segCount - 1);
    var sTarget = minS + range * t;
    var wsum = 0;
    var lsum = 0;
    var lAbs = 0;
    for (var j = 0; j < samples.length; j++) {
      var ds = Math.abs(samples[j].s - sTarget);
      var w = 1 / (0.35 + ds);
      wsum += w;
      lsum += samples[j].l * w;
    }
    var lMean = wsum > 0 ? lsum / wsum : 0;
    for (var k = 0; k < samples.length; k++) {
      var ds2 = Math.abs(samples[k].s - sTarget);
      var w2 = 1 / (0.35 + ds2);
      lAbs += Math.abs(samples[k].l - lMean) * w2;
    }
    var radius = Math.max(approxR * 0.18, (wsum > 0 ? lAbs / wsum : approxR * 0.35));
    var profile = Math.sin(Math.PI * t);
    radius *= 0.42 + profile * 0.78;
    // Lateral offset tapers to 0 at the head end to prevent face wobble.
    // t=0 = tail (full offset), t=1 = head (zero offset).
    var lateralWeight = 0.22 * Math.max(0, 1 - Math.max(0, t - 0.45) / 0.55);
    points.push({
      x: center.x + fx * sTarget + sx * (lMean * lateralWeight),
      y: center.y + fy * sTarget + sy * (lMean * lateralWeight)
    });
    radii.push(radius);
  }

  var speed = 0;
  if (creature.sourceCreature) {
    speed = Math.sqrt((creature.sourceCreature.vx || 0) * (creature.sourceCreature.vx || 0) + (creature.sourceCreature.vy || 0) * (creature.sourceCreature.vy || 0));
  }
  // Higher floor (0.75) for denser temporal smoothing; less responsive to node noise.
  var smooth = Math.max(0.75, Math.min(0.88, 0.86 - speed * 0.003));
  var prev = creature._spineSmoothing;
  if (prev && prev.points && prev.points.length === points.length) {
    for (var s = 0; s < points.length; s++) {
      points[s].x = prev.points[s].x * smooth + points[s].x * (1 - smooth);
      points[s].y = prev.points[s].y * smooth + points[s].y * (1 - smooth);
      radii[s] = prev.radii[s] * smooth + radii[s] * (1 - smooth);
    }
  }

  dcConstrainSpine(points, Math.max(4, range / Math.max(1, segCount - 1)), 0.38);

  creature._spineSmoothing = {
    points: points.map(function (p) { return { x: p.x, y: p.y }; }),
    radii: radii.slice()
  };

  var tangents = [];
  var left = [];
  var right = [];
  for (var p = 0; p < points.length; p++) {
    var prev = points[Math.max(0, p - 1)];
    var next = points[Math.min(points.length - 1, p + 1)];
    var tx = next.x - prev.x;
    var ty = next.y - prev.y;
    var tm = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tm;
    ty /= tm;
    tangents.push({ x: tx, y: ty });
    var nx = -ty;
    var ny = tx;
    left.push({ x: points[p].x + nx * radii[p], y: points[p].y + ny * radii[p] });
    right.push({ x: points[p].x - nx * radii[p], y: points[p].y - ny * radii[p] });
  }

  return { center: center, points: points, radii: radii, tangents: tangents, left: left, right: right };
};

window.DriftCreatures.drawProceduralBody = function (ctx, creature, spineData, genome) {
  var left = spineData.left;
  var right = spineData.right;
  var ink = DC_INK;

  function tracePath() {
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (var i = 1; i < left.length; i++) {
      var lp = left[i - 1], lc = left[i];
      ctx.quadraticCurveTo(lp.x, lp.y, (lp.x + lc.x) * 0.5, (lp.y + lc.y) * 0.5);
    }
    for (var j = right.length - 1; j >= 0; j--) {
      var rc = right[j];
      var rp = right[Math.max(0, j - 1)];
      if (j === right.length - 1) ctx.lineTo(rc.x, rc.y);
      else ctx.quadraticCurveTo(rc.x, rc.y, (rc.x + rp.x) * 0.5, (rc.y + rp.y) * 0.5);
    }
    ctx.closePath();
  }

  var approxR = creature.getApproxSize ? creature.getApproxSize() : 12;

  // Idle squash-and-stretch breathing (purely visual)
  var tNow = Number.isFinite(creature.time) ? creature.time : 0;
  var breathe = 1 + Math.sin(tNow * 1.6) * 0.025;
  ctx.save();
  // Apply breathing around the body center
  var center = spineData.center || { x: 0, y: 0 };
  ctx.translate(center.x, center.y);
  ctx.scale(breathe, 2 - breathe);
  ctx.translate(-center.x, -center.y);

  // 1) Thick ink outline
  tracePath();
  ctx.strokeStyle = ink;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2.6, Math.min(5.5, approxR * 0.22));
  ctx.stroke();

  // 2) Flat fill
  tracePath();
  ctx.fillStyle = dcHexToRgba(genome.colors.body, 1);
  ctx.fill();

  // 3) Inside-only highlight + belly tone
  ctx.save();
  tracePath();
  ctx.clip();
  var pts = spineData.points;
  var midIdx = Math.floor(pts.length / 2);
  var mid = pts[midIdx];
  var rad = (spineData.radii && spineData.radii[midIdx]) || approxR * 0.6;
  var fx = creature.facing.x || 1, fy = creature.facing.y || 0;
  var nx = -fy, ny = fx;
  var ang = Math.atan2(fy, fx);
  // Top highlight (lighter)
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(mid.x - nx * rad * 0.45, mid.y - ny * rad * 0.45, rad * 1.1, rad * 0.5, ang, 0, Math.PI * 2);
  ctx.fill();
  // Belly band (darker)
  ctx.fillStyle = dcHexToRgba(genome.colors.accent, 0.32);
  ctx.beginPath();
  ctx.ellipse(mid.x + nx * rad * 0.45, mid.y + ny * rad * 0.45, rad * 1.1, rad * 0.5, ang, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
};

function dcConstrainSpine(points, segmentLength, maxTurn) {
  if (points.length < 3) return;
  var tailAnchor = { x: points[0].x, y: points[0].y };
  var headAnchor = { x: points[points.length - 1].x, y: points[points.length - 1].y };

  for (var iter = 0; iter < 3; iter++) {
    points[0].x = tailAnchor.x;
    points[0].y = tailAnchor.y;
    for (var i = 1; i < points.length; i++) {
      var dx = points[i].x - points[i - 1].x;
      var dy = points[i].y - points[i - 1].y;
      var m = Math.sqrt(dx * dx + dy * dy) || 1;
      points[i].x = points[i - 1].x + (dx / m) * segmentLength;
      points[i].y = points[i - 1].y + (dy / m) * segmentLength;
    }

    points[points.length - 1].x = headAnchor.x;
    points[points.length - 1].y = headAnchor.y;
    for (var j = points.length - 2; j >= 0; j--) {
      var dx2 = points[j].x - points[j + 1].x;
      var dy2 = points[j].y - points[j + 1].y;
      var m2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
      points[j].x = points[j + 1].x + (dx2 / m2) * segmentLength;
      points[j].y = points[j + 1].y + (dy2 / m2) * segmentLength;
    }

    for (var k = 1; k < points.length - 1; k++) {
      var a = points[k - 1];
      var b = points[k];
      var c = points[k + 1];
      var abx = b.x - a.x;
      var aby = b.y - a.y;
      var bcx = c.x - b.x;
      var bcy = c.y - b.y;
      var lenAB = Math.sqrt(abx * abx + aby * aby) || 1;
      var lenBC = Math.sqrt(bcx * bcx + bcy * bcy) || 1;
      var angAB = Math.atan2(aby, abx);
      var angBC = Math.atan2(bcy, bcx);
      var delta = angBC - angAB;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) <= maxTurn) continue;
      var clamped = angAB + (delta > 0 ? maxTurn : -maxTurn);
      c.x = b.x + Math.cos(clamped) * lenBC;
      c.y = b.y + Math.sin(clamped) * lenBC;
    }
  }
}

function dcAnchorFromPoint(center, point, fallbackX, fallbackY) {
  var dx = point.x - center.x;
  var dy = point.y - center.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.0001) {
    dx = fallbackX || 1;
    dy = fallbackY || 0;
  }
  return { x: point.x, y: point.y, angle: Math.atan2(dy, dx) };
}

function dcAnchorMix(center, a, b, t) {
  var x = a.x + (b.x - a.x) * t;
  var y = a.y + (b.y - a.y) * t;
  return dcAnchorFromPoint(center, { x: x, y: y }, 1, 0);
}

function dcAnchorFromCustomPlacement(spine, placement) {
  var t = Math.max(0, Math.min(1, placement.t || 0.5));
  var across = Math.max(-1.35, Math.min(1.35, placement.across || 0));
  var n = spine.points.length;
  var f = t * (n - 1);
  var i0 = Math.floor(f);
  var i1 = Math.min(n - 1, i0 + 1);
  var a = f - i0;
  var px = spine.points[i0].x + (spine.points[i1].x - spine.points[i0].x) * a;
  var py = spine.points[i0].y + (spine.points[i1].y - spine.points[i0].y) * a;
  var tx = spine.tangents[i0].x + (spine.tangents[i1].x - spine.tangents[i0].x) * a;
  var ty = spine.tangents[i0].y + (spine.tangents[i1].y - spine.tangents[i0].y) * a;
  var tm = Math.sqrt(tx * tx + ty * ty) || 1;
  tx /= tm;
  ty /= tm;
  var nx = -ty;
  var ny = tx;
  var radius = spine.radii[i0] + (spine.radii[i1] - spine.radii[i0]) * a;
  var x = px + nx * radius * across;
  var y = py + ny * radius * across;
  var ax = across >= 0 ? nx : -nx;
  var ay = across >= 0 ? ny : -ny;
  return { x: x, y: y, angle: Math.atan2(ay, ax) };
}

window.DriftCreatures.setPartPlacementFromWorld = function (creature, partIndex, worldX, worldY) {
  if (!creature || !creature.parts || partIndex < 0 || partIndex >= creature.parts.length) return;
  var D = window.DriftCreatures;
  var spine = creature._procSpine || D.getProceduralSpine(creature, D.getBodyCenter(creature.body), creature.getApproxSize());
  var bestI = 0;
  var bestDist = Infinity;
  for (var i = 0; i < spine.points.length; i++) {
    var dx = worldX - spine.points[i].x;
    var dy = worldY - spine.points[i].y;
    var d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestI = i;
    }
  }
  var p = spine.points[bestI];
  var tng = spine.tangents[bestI] || { x: 1, y: 0 };
  var nx = -tng.y;
  var ny = tng.x;
  var rx = worldX - p.x;
  var ry = worldY - p.y;
  var radius = spine.radii && Number.isFinite(spine.radii[bestI]) ? Math.max(1, spine.radii[bestI]) : 1;
  var across = (rx * nx + ry * ny) / radius;
  if (!Number.isFinite(across)) across = 0;
  creature.parts[partIndex].userPlacement = {
    t: bestI / Math.max(1, spine.points.length - 1),
    across: Math.max(-1.35, Math.min(1.35, across))
  };
};

function dcRenderEyeVariant(ctx, genome, sz, variant, time, creature) {
  var ink = DC_INK;
  var mood = (creature && creature.mood) || "calm";
  // Periodic blink (each eye uses variant+phase as seed)
  var blinkPhase = (variant || 0) * 1.37 + (creature ? (creature.body && creature.body.nodes && creature.body.nodes[0] ? (creature.body.nodes[0].x * 0.013) : 0) : 0);
  var blinkCycle = ((time + blinkPhase) % 4.2) / 4.2;
  var blinking = blinkCycle > 0.95;
  var blinkAmt = blinking ? Math.sin((blinkCycle - 0.95) / 0.05 * Math.PI) : 0;

  var eyeW = sz * 1.45;
  var eyeH = sz * 1.45;
  var pupilR = sz * 0.6;
  var look = sz * 0.18;
  var angryBrow = false;
  if (mood === "afraid") { eyeW = sz * 1.55; eyeH = sz * 1.6; pupilR = sz * 0.42; look = 0; }
  else if (mood === "aggressive") { angryBrow = true; eyeH *= 0.78; pupilR = sz * 0.5; }
  else if (mood === "hungry") { eyeW = sz * 1.3; eyeH = sz * 1.2; }
  else if (mood === "feeding") { blinkAmt = 0.85; }

  // Sclera
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.3, sz * 0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, eyeW, Math.max(sz * 0.05, eyeH * (1 - blinkAmt)), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (blinkAmt < 0.7) {
    // Pupil
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(look, 0, pupilR, 0, Math.PI * 2);
    ctx.fill();
    // Sparkle highlight
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(look + pupilR * 0.4, -pupilR * 0.4, pupilR * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }

  if (angryBrow) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.6, sz * 0.26);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-eyeW * 0.95, -eyeH * 1.0);
    ctx.lineTo(eyeW * 0.55, -eyeH * 0.25);
    ctx.stroke();
    ctx.lineCap = "butt";
  }
}

function dcRenderMouthVariant(ctx, genome, sz, variant, time, dietType, creature) {
  var ink = DC_INK;
  var mood = (creature && creature.mood) || "calm";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.6, sz * 0.22);

  // Mood-driven mouth shape (overrides diet variant)
  if (mood === "feeding") {
    // Closed happy curve plus chew bob
    var bob = Math.sin(time * 8) * sz * 0.06;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.7, bob);
    ctx.quadraticCurveTo(0, sz * 0.55 + bob, sz * 0.7, bob);
    ctx.stroke();
    return;
  }
  if (mood === "afraid") {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(sz * 0.35, 0, sz * 0.42, sz * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff8aa8";
    ctx.beginPath();
    ctx.ellipse(sz * 0.38, sz * 0.06, sz * 0.26, sz * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (dietType === "carnivore") {
    // Toothy grin
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.6, -sz * 0.06);
    ctx.lineTo(sz * 0.9, -sz * 0.06);
    ctx.lineTo(sz * 0.9, sz * 0.06);
    ctx.lineTo(-sz * 0.6, sz * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    var teeth = 5;
    for (var i = 0; i < teeth; i++) {
      var tx = -sz * 0.55 + i * (sz * 1.5 / (teeth - 1));
      ctx.beginPath();
      ctx.moveTo(tx, -sz * 0.06);
      ctx.lineTo(tx + sz * 0.12, sz * 0.2);
      ctx.lineTo(tx + sz * 0.24, -sz * 0.06);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  if (dietType === "herbivore") {
    // Gentle smile + tiny pink tongue
    ctx.beginPath();
    ctx.moveTo(-sz * 0.55, -sz * 0.05);
    ctx.quadraticCurveTo(0, sz * 0.55, sz * 0.55, -sz * 0.05);
    ctx.stroke();
    ctx.fillStyle = "#ff8aa8";
    ctx.beginPath();
    ctx.arc(0, sz * 0.22, sz * 0.16, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // omnivore: open `o` with tongue
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(0, sz * 0.08, sz * 0.5, sz * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ff8aa8";
  ctx.beginPath();
  ctx.ellipse(0, sz * 0.18, sz * 0.3, sz * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  return;
  // legacy code below kept commented for reference
  /* eslint-disable */
  var base = variant % 5;
  var family = Math.floor(variant / 5);
  var biteScale = 1 + family * 0.05;
  ctx.fillStyle = dcHexToRgba(genome.colors.detail, 0.82);
  ctx.strokeStyle = dcHexToRgba(genome.colors.accent, 0.6);
  ctx.lineWidth = 1;
  if (dietType === "herbivore") {
    ctx.strokeStyle = dcHexToRgba(genome.colors.accent, 0.45);
  } else if (dietType === "carnivore") {
    ctx.strokeStyle = dcHexToRgba(genome.colors.detail, 0.75);
  }
  if (base === 0) {
    ctx.beginPath();
    ctx.ellipse(sz * 0.5, 0, sz * (0.6 + family * 0.03), sz * 0.2, 0, 0, Math.PI * 2);
  } else if (base === 1) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(sz * 0.5, -sz * (0.2 + family * 0.02), sz * 0.92, 0);
    ctx.quadraticCurveTo(sz * 0.5, sz * (0.2 + family * 0.02), 0, 0);
  } else if (base === 2) {
    ctx.beginPath();
    ctx.arc(sz * 0.48, 0, sz * 0.32, -0.9, 0.9);
  } else if (base === 3) {
    ctx.beginPath();
    ctx.rect(sz * 0.12, -sz * 0.16, sz * (0.72 + family * 0.02), sz * 0.32);
  } else {
    var bite = Math.sin(time * 4.8) * sz * 0.08 * biteScale;
    ctx.beginPath();
    ctx.moveTo(0, -bite);
    ctx.lineTo(sz * (0.9 + family * 0.03), 0);
    ctx.lineTo(0, bite);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
}

function dcRenderFinVariant(ctx, genome, sz, variant, time, creature) {
  var ink = DC_INK;
  var flap = Math.sin(time * 2.6 + (variant || 0)) * 0.22;
  ctx.save();
  ctx.rotate(flap);
  ctx.fillStyle = dcHexToRgba(genome.colors.accent, 1);
  ctx.strokeStyle = ink;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, sz * 0.18);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(sz * 0.4, -sz * 0.95, sz * 1.25, -sz * 0.05);
  ctx.quadraticCurveTo(sz * 0.85, sz * 0.32, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // single rib highlight
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = Math.max(1, sz * 0.1);
  ctx.beginPath();
  ctx.moveTo(sz * 0.18, -sz * 0.1);
  ctx.quadraticCurveTo(sz * 0.6, -sz * 0.55, sz * 1.05, -sz * 0.08);
  ctx.stroke();
  ctx.restore();
}

function dcRenderTailVariant(ctx, genome, sz, variant, time, creature) {
  var ink = DC_INK;
  var wag = Math.sin(time * 3 + (variant || 0)) * 0.22;
  ctx.save();
  ctx.rotate(wag);
  ctx.fillStyle = dcHexToRgba(genome.colors.accent, 1);
  ctx.strokeStyle = ink;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, sz * 0.18);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-sz * 1.0, -sz * 0.55);
  ctx.lineTo(-sz * 1.35, 0);
  ctx.lineTo(-sz * 1.0, sz * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function dcRenderWeaponVariant(ctx, genome, sz, variant, time, creature) {
  var ink = DC_INK;
  ctx.fillStyle = "#fffaf0";
  ctx.strokeStyle = ink;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.4, sz * 0.18);
  ctx.beginPath();
  ctx.moveTo(0, -sz * 0.32);
  ctx.lineTo(sz * 1.1, 0);
  ctx.lineTo(0, sz * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return;
  /* eslint-disable */
  var base = variant % 5;
  var family = Math.floor(variant / 5);
  var spikeScale = 1 + family * 0.05;
  ctx.fillStyle = dcHexToRgba(genome.colors.accent, 0.82);
  ctx.strokeStyle = dcHexToRgba(genome.colors.detail, 0.56);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  if (base === 0) {
    ctx.moveTo(0, -sz * 0.18);
    ctx.lineTo(sz * 1.08 * spikeScale, 0);
    ctx.lineTo(0, sz * 0.18);
  } else if (base === 1) {
    ctx.moveTo(0, -sz * 0.24);
    ctx.lineTo(sz * 0.48 * spikeScale, -sz * 0.08);
    ctx.lineTo(sz * 1.02 * spikeScale, 0);
    ctx.lineTo(sz * 0.48 * spikeScale, sz * 0.08);
    ctx.lineTo(0, sz * 0.24);
  } else if (base === 2) {
    ctx.moveTo(0, 0);
    ctx.lineTo(sz * 0.78 * spikeScale, -sz * 0.25);
    ctx.lineTo(sz * 1.1 * spikeScale, 0);
    ctx.lineTo(sz * 0.78 * spikeScale, sz * 0.25);
  } else if (base === 3) {
    ctx.moveTo(0, -sz * 0.1);
    ctx.lineTo(sz * 0.74 * spikeScale, -sz * 0.34);
    ctx.lineTo(sz * 1.06 * spikeScale, 0);
    ctx.lineTo(sz * 0.74 * spikeScale, sz * 0.34);
    ctx.lineTo(0, sz * 0.1);
  } else {
    var pulse = Math.sin(time * (3.2 + family * 0.24)) * sz * 0.08;
    ctx.moveTo(0, -sz * 0.2);
    ctx.lineTo(sz * 0.94 * spikeScale, pulse);
    ctx.lineTo(0, sz * 0.2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function dcRenderDefenseVariant(ctx, genome, sz, variant, time, creature) {
  var ink = DC_INK;
  ctx.fillStyle = dcHexToRgba(genome.colors.accent, 1);
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.4, sz * 0.16);
  ctx.beginPath();
  ctx.ellipse(0, 0, sz * 0.55, sz * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(-sz * 0.15, -sz * 0.22, sz * 0.16, sz * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  return;
  /* eslint-disable */
  var base = variant % 5;
  var family = Math.floor(variant / 5);
  var plateScale = 1 + family * 0.05;
  ctx.fillStyle = dcHexToRgba(genome.colors.accent, 0.64);
  ctx.strokeStyle = dcHexToRgba(genome.colors.detail, 0.58);
  ctx.lineWidth = 1;
  if (base === 0) {
    ctx.beginPath();
    ctx.ellipse(0, 0, sz * 0.42 * plateScale, sz * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (base === 1) {
    ctx.beginPath();
    ctx.moveTo(0, -sz * 0.54);
    ctx.lineTo(sz * 0.38 * plateScale, -sz * 0.18);
    ctx.lineTo(sz * 0.32 * plateScale, sz * 0.54);
    ctx.lineTo(-sz * 0.32 * plateScale, sz * 0.54);
    ctx.lineTo(-sz * 0.38 * plateScale, -sz * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (base === 2) {
    ctx.beginPath();
    ctx.rect(-sz * 0.24 * plateScale, -sz * 0.52, sz * 0.48 * plateScale, sz * 1.04);
    ctx.fill();
    ctx.stroke();
  } else if (base === 3) {
    ctx.beginPath();
    ctx.arc(0, 0, sz * 0.48 * plateScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, sz * 0.2 * plateScale, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    var flare = Math.sin(time * (2.8 + family * 0.2)) * sz * 0.05;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 0.58);
    ctx.lineTo(sz * 0.24 * plateScale + flare, -sz * 0.12);
    ctx.lineTo(sz * 0.12 * plateScale, sz * 0.58);
    ctx.lineTo(-sz * 0.12 * plateScale, sz * 0.58);
    ctx.lineTo(-sz * 0.24 * plateScale - flare, -sz * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function dcRenderDetailVariant(ctx, genome, sz, variant, time, creature) {
  var ink = DC_INK;
  ctx.fillStyle = dcHexToRgba(genome.colors.accent, 1);
  ctx.strokeStyle = ink;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, sz * 0.16);
  // small 5-point star
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var a = -Math.PI / 2 + i * (Math.PI / 5);
    var r = (i % 2 === 0) ? sz * 0.6 : sz * 0.28;
    var ax = Math.cos(a) * r;
    var ay = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return;
  /* eslint-disable */
  ctx.strokeStyle = dcHexToRgba(genome.colors.accent, 0.72);
  ctx.fillStyle = dcHexToRgba(genome.colors.accent, 0.72);
  ctx.lineWidth = 1;
  if (variant === 0) {
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * sz * 0.12, 0);
      ctx.quadraticCurveTo(sz * 0.32, i * sz * 0.1, sz * 0.72, i * sz * 0.2);
      ctx.stroke();
    }
  } else if (variant === 1) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sz * 0.22, -sz * 0.24, sz * 0.64, -sz * 0.22, sz * 0.88, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sz * 0.22, sz * 0.24, sz * 0.64, sz * 0.22, sz * 0.88, 0);
    ctx.stroke();
  } else if (variant === 2) {
    ctx.beginPath();
    ctx.arc(sz * 0.38, 0, sz * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sz * 0.72, 0, sz * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else if (variant === 3) {
    for (var j = 0; j < 3; j++) {
      var w = Math.sin(time * 6 + j) * sz * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(sz * (0.45 + j * 0.2), w + (j - 1) * sz * 0.14);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sz * 0.16, -sz * 0.3, sz * 0.62, -sz * 0.34, sz * 0.96, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sz * 0.96, 0, sz * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dcHexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return "rgba(100,200,255," + alpha + ")";
  var r = parseInt(hex.slice(1, 3), 16) || 0;
  var g = parseInt(hex.slice(3, 5), 16) || 0;
  var b = parseInt(hex.slice(5, 7), 16) || 0;
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}
