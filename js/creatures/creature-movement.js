window.DriftCreatures = window.DriftCreatures || {};

window.DriftCreatures.updateCreatureMovement = function (creature, dt, inputTarget) {
  var D = window.DriftCreatures;
  var body = creature.body;
  var center = D.getBodyCenter(body);
  var style = creature.genome.movement.style;
  var speed = creature.getEffectiveSpeed();
  var time = creature.time;
  var TAU = Math.PI * 2;

  var tx, ty;
  if (inputTarget) {
    tx = inputTarget.x;
    ty = inputTarget.y;
  } else if (creature.target) {
    tx = creature.target.x;
    ty = creature.target.y;
  } else {
    tx = center.x + Math.cos(time * 0.4) * 100;
    ty = center.y + Math.sin(time * 0.4) * 100;
  }

  var dx = tx - center.x;
  var dy = ty - center.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 0.0001;
  var desiredX = dx / len;
  var desiredY = dy / len;
  var prevX = creature.facing && Number.isFinite(creature.facing.x) ? creature.facing.x : desiredX;
  var prevY = creature.facing && Number.isFinite(creature.facing.y) ? creature.facing.y : desiredY;
  var prevLen = Math.sqrt(prevX * prevX + prevY * prevY) || 1;
  prevX /= prevLen;
  prevY /= prevLen;
  var targetHeading = Math.atan2(desiredY, desiredX);
  var prevHeading = Math.atan2(prevY, prevX);
  var headingDelta = targetHeading - prevHeading;
  while (headingDelta > Math.PI) headingDelta -= Math.PI * 2;
  while (headingDelta < -Math.PI) headingDelta += Math.PI * 2;
  var maxTurnCap  = creature.getEffectiveTurnMax ? creature.getEffectiveTurnMax() : 2.80;
  var maxTurnPerSec = Math.max(1.0, Math.min(maxTurnCap, creature.genome.movement.turnSpeed));
  var maxTurnStep = maxTurnPerSec * dt;
  var clampedDelta = Math.max(-maxTurnStep, Math.min(maxTurnStep, headingDelta));
  var facingHeading = prevHeading + clampedDelta;
  var nx = Math.cos(facingHeading);
  var ny = Math.sin(facingHeading);
  creature.turnRate = clampedDelta / Math.max(dt, 0.001);
  var arrive = Math.max(0.2, Math.min(1, len / 160));
  var drive = speed * arrive;

  if (style === "wriggle") {
    var approxSize = creature.getApproxSize ? creature.getApproxSize() : 24;
    // Wave forces only for elongated/slender bodies (elongation > 1.0).
    // More elongated = stronger tail wag; compact blobs just push forward.
    var elong = (creature.genome.body && creature.genome.body.elongation) || 1.0;
    var waveGate = Math.max(0, (elong - 1.0) / 0.55);  // 0 at elong=1.0, 1 at elong≈1.55
    if (waveGate > 0) {
      for (var i = 0; i < body.nodes.length; i++) {
        var ndx = body.nodes[i].x - center.x;
        var ndy = body.nodes[i].y - center.y;
        var along = ndx * nx + ndy * ny;
        // tAlong: 0 = tail end, 1 = head end (position along body axis)
        var tAlong = Math.max(0, Math.min(1, (along + approxSize) / (approxSize * 2 + 0.001)));
        var bodyPos = 1.0 - tAlong; // 0 = head, 1 = tail
        // Traveling undulation: wave propagates head → tail (biological fish swimming).
        // Phase advances toward the tail so the tail displacement lags the head.
        var wavePhase = bodyPos * TAU * 1.1 - time * 3.0;
        var wave = Math.sin(wavePhase);
        // Amplitude envelope: nearly zero at head, full at tail (eel/fish pattern)
        var ampBias = Math.pow(Math.max(0, bodyPos), 0.8);
        D.applyForceToNode(body, i,
          -ny * wave * drive * dt * 0.028 * ampBias * waveGate,
           nx * wave * drive * dt * 0.028 * ampBias * waveGate);
      }
    }
    D.applyForceToBody(body, nx * drive * dt * 0.22, ny * drive * dt * 0.22);

  } else if (style === "pulse") {
    // Asymmetric jellyfish bell: fast contraction, slow relaxed expansion.
    var pulsePhase = (time * 2.6) % (Math.PI * 2);
    var contractFrac = 0.30;
    var pulseCurve;
    if (pulsePhase < Math.PI * contractFrac) {
      // Fast contraction: 1 → 0
      pulseCurve = 1.0 - pulsePhase / (Math.PI * contractFrac);
    } else {
      // Slow relaxation: 0 → 1
      pulseCurve = (pulsePhase - Math.PI * contractFrac) / (Math.PI * (2.0 - contractFrac));
    }
    // Peak thrust fires at contraction peak (pulseCurve near 0)
    var thrustPulse = Math.pow(Math.max(0, 1.0 - pulseCurve * 1.5), 1.4) + 0.18;
    D.applyForceToBody(body, nx * drive * dt * thrustPulse * 0.62, ny * drive * dt * thrustPulse * 0.62);

    var centerNow = D.getBodyCenter(body);
    for (var i = 0; i < body.nodes.length; i++) {
      var node = body.nodes[i];
      var bx = node.x - centerNow.x;
      var by = node.y - centerNow.y;
      var blen = Math.sqrt(bx * bx + by * by) || 0.0001;
      // Strong inward pull during contraction, gentle outward drift during relaxation
      var inflate = pulseCurve < 0.15 ? -0.10 : pulseCurve * 0.055;
      node.x += (bx / blen) * inflate;
      node.y += (by / blen) * inflate;
    }

  } else if (style === "fin") {
    D.applyForceToBody(body, nx * drive * dt * 0.35, ny * drive * dt * 0.35);
    var elongFin = (creature.genome.body && creature.genome.body.elongation) || 1.0;
    var finWaveGate = Math.max(0, (elongFin - 0.9) / 0.65);
    if (finWaveGate > 0) {
      var finWave = Math.sin(time * 3.2) * 0.15 * finWaveGate;
      // Only apply fin wave to rear half of body
      var n0 = body.nodes.length;
      for (var fi = 0; fi < n0; fi++) {
        var fndx = body.nodes[fi].x - center.x;
        var fndy = body.nodes[fi].y - center.y;
        var falong = fndx * nx + fndy * ny;
        if (falong < 0) {
          D.applyForceToNode(body, fi, -ny * finWave, nx * finWave);
        }
      }
    }

  } else if (style === "crawl") {
    for (var i = 0; i < body.nodes.length; i++) {
      var grab = Math.sin(time * 6 + i * 0.8) > 0 ? 1 : 0.25;
      D.applyForceToNode(body, i, nx * drive * dt * grab * 0.03, ny * drive * dt * grab * 0.03);
    }

  } else {
    // drift
    var driftX = Math.cos(time * 0.7 + creature.idNumber) * 0.15;
    var driftY = Math.sin(time * 0.9 + creature.idNumber) * 0.15;
    D.applyForceToBody(body, driftX + nx * drive * dt * 0.12, driftY + ny * drive * dt * 0.12);
  }

  // ── Anisotropic water resistance ──────────────────────────────────────────
  // Dampen lateral (sideways) velocity more than forward velocity.
  // Creates the "pushing through water" feel of real aquatic movement.
  {
    var _bn = body.nodes.length;
    var _avgVx = 0, _avgVy = 0;
    for (var _wi = 0; _wi < _bn; _wi++) {
      _avgVx += body.nodes[_wi].x - body.nodes[_wi].prevX;
      _avgVy += body.nodes[_wi].y - body.nodes[_wi].prevY;
    }
    _avgVx /= _bn; _avgVy /= _bn;
    // Decompose average velocity into forward and lateral components
    var _fwdComp = _avgVx * nx + _avgVy * ny;
    var _latVx = _avgVx - nx * _fwdComp;
    var _latVy = _avgVy - ny * _fwdComp;
    // Nudge prevX/Y toward current to reduce lateral velocity (water resists sideways slip)
    var _latDamp = (style === 'crawl' || style === 'drift') ? 0.08 : 0.18;
    for (var _wi2 = 0; _wi2 < _bn; _wi2++) {
      body.nodes[_wi2].prevX += _latVx * _latDamp;
      body.nodes[_wi2].prevY += _latVy * _latDamp;
    }
  }

  // ── Mouth-anchored facing correction ──────────────────────────────────────
  // Find which end of the body is actually "forward" (mouth end) by computing
  // the physical body axis: average of front-half nodes minus rear-half nodes.
  // Blend nx/ny toward that axis so the rendered mouth always faces the right way.
  {
    var mouthParts = creature.parts.filter(function (p) {
      return p.type === 'mouth' || p.type === 'herbivoreMouth' ||
             p.type === 'carnivoreMouth' || p.type === 'omnivoreMouth';
    });
    // Only run if there are mouth parts and we have enough nodes.
    if (mouthParts.length > 0 && body.nodes.length >= 4) {
      // Split nodes into "front" and "rear" halves based on current heading.
      var fwdSumX = 0, fwdSumY = 0, fwdN = 0;
      var rearSumX = 0, rearSumY = 0, rearN = 0;
      for (var mi = 0; mi < body.nodes.length; mi++) {
        var ndotX = body.nodes[mi].x - center.x;
        var ndotY = body.nodes[mi].y - center.y;
        var ndot  = ndotX * nx + ndotY * ny;
        if (ndot >= 0) { fwdSumX += body.nodes[mi].x; fwdSumY += body.nodes[mi].y; fwdN++; }
        else           { rearSumX += body.nodes[mi].x; rearSumY += body.nodes[mi].y; rearN++; }
      }
      if (fwdN > 0 && rearN > 0) {
        var physX = (fwdSumX / fwdN) - (rearSumX / rearN);
        var physY = (fwdSumY / fwdN) - (rearSumY / rearN);
        var physLen = Math.sqrt(physX * physX + physY * physY);
        if (physLen > 0.5) {
          physX /= physLen;
          physY /= physLen;
          // Soft blend: 88% desired heading, 12% physical body axis.
          // This pins the "mouth end" to the actual forward cluster.
          nx = nx * 0.88 + physX * 0.12;
          ny = ny * 0.88 + physY * 0.12;
          var bl = Math.sqrt(nx * nx + ny * ny) || 1;
          nx /= bl;
          ny /= bl;
        }
      }
    }
  }

  creature.facing.x = nx;
  creature.facing.y = ny;
};
