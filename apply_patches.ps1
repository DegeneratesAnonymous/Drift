$file = 'c:\Users\colem\OneDrive\Adaptacell\Drift\game.js'

function Lines([string]$s) {
    return $s -split "`n" | ForEach-Object { $_ -replace "`r", "" }
}

# ── PATCH 1: Player spine-bend (insert after Player angle update closing brace) ──
$p1 = Lines @'
    // spine-bend physics
    if (this._spinePrevAngle === undefined) this._spinePrevAngle = this.angle;
    let _spDelta = this.angle - this._spinePrevAngle;
    if (_spDelta > Math.PI) _spDelta -= TAU;
    if (_spDelta < -Math.PI) _spDelta += TAU;
    this._spinePrevAngle = this.angle;
    const _pBendTarget = clamp(_spDelta / Math.max(0.008, dt) * 0.055, -0.85, 0.85);
    this._bendMid  = lerp(this._bendMid  || 0, _pBendTarget, Math.min(1, dt * 5.5));
    this._bendTail = lerp(this._bendTail || 0, this._bendMid, Math.min(1, dt * 3.2));
'@

# ── PATCH 2: Creature spine-bend ──
$p2 = Lines @'
    // spine-bend physics
    if (this._spinePrevAngle === undefined) this._spinePrevAngle = this.angle;
    let _cSpDelta = this.angle - this._spinePrevAngle;
    if (_cSpDelta > Math.PI) _cSpDelta -= TAU;
    if (_cSpDelta < -Math.PI) _cSpDelta += TAU;
    this._spinePrevAngle = this.angle;
    const _cBendTarget = clamp(_cSpDelta / Math.max(0.008, dt) * 0.055, -0.85, 0.85);
    this._bendMid  = lerp(this._bendMid  || 0, _cBendTarget, Math.min(1, dt * 4.5));
    this._bendTail = lerp(this._bendTail || 0, this._bendMid, Math.min(1, dt * 2.8));
'@

# ── PATCH 3: Player.draw() fish-body section ──
$p3 = Lines @'
    // body — fish-body bezier silhouette with spine-bend
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);

    const gs = 1 + (this.r - T.PLAYER_START_SIZE) * 0.018;
    const bodyShape = this.creatorBody || 'round';
    const bHue = this.creatorHue !== undefined ? this.creatorHue : 195;
    const motion = clamp(Math.hypot(this.vx || 0, this.vy || 0) / Math.max(1, this.speed), 0, 1);
    const prx = r * (bodyShape==='long'?1.38:bodyShape==='oval'?1.14:bodyShape==='soft'?0.96:1.04) * gs * (1 + motion * 0.07);
    const pry = r * (bodyShape==='long'?0.60:bodyShape==='oval'?0.80:bodyShape==='soft'?0.94:0.80) * gs * (1 - motion * 0.04);
    const ptailX  = -(prx + r * 0.16);
    const pheadX  =  prx * 0.80;
    const pheadTip = prx + r * 0.40;
    const tailShiftP = (this._bendTail || 0) * prx * 0.42;
    const midShiftP  = (this._bendMid  || 0) * prx * 0.18;
    const ptailW = pry * 0.46;

    ctx.fillStyle   = hslaCSS(bHue, 75, 75, 0.95);
    ctx.strokeStyle = hslaCSS(bHue, 80, 85, 0.6);
    ctx.lineWidth = Math.max(0.8, r * 0.038) * gs;
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
    ctx.beginPath(); ctx.arc(prx * 0.05, 0, r * 0.32 * gs, 0, TAU); ctx.fill();

    const eyeX = pheadX * 0.72, eyeY = -pry * 0.38;
    ctx.fillStyle = hslaCSS(0, 0, 96, 0.92);
    ctx.beginPath(); ctx.arc(eyeX, eyeY, r * 0.155 * gs, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(bHue + 20, 65, 45, 0.90);
    ctx.beginPath(); ctx.arc(eyeX + r*0.025*gs, eyeY, r * 0.10 * gs, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(0, 0, 8, 1);
    ctx.beginPath(); ctx.arc(eyeX + r*0.035*gs, eyeY, r * 0.058 * gs, 0, TAU); ctx.fill();
    ctx.fillStyle = hslaCSS(0, 0, 100, 0.85);
    ctx.beginPath(); ctx.arc(eyeX + r*0.055*gs, eyeY - r*0.038*gs, r * 0.028 * gs, 0, TAU); ctx.fill();

    ctx.strokeStyle = hslaCSS(bHue + 10, 50, 35, 0.55);
    ctx.lineWidth = Math.max(0.6, r * 0.028) * gs;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pheadTip - r*0.04*gs, -r*0.055*gs);
    ctx.lineTo(pheadTip + r*0.02*gs,  r*0.055*gs);
    ctx.stroke();
    ctx.lineCap = 'butt';

    this.drawMutationParts(ctx, r);

    ctx.restore();
'@

# ── PATCH 4: Creature.draw() fish-body section (replaces body shape .. ctx.restore) ──
$p4 = Lines @'
    // body — fish-body bezier silhouette with spine-bend
    const bodyHue = lerp(this.hue, 0, clamp(this.hitFlash * 0.6, 0, 1));
    const bodySat = lerp(this.sat, 85, clamp(this.hitFlash * 0.7, 0, 1));
    const bodyLight = lerp(this.light, 62, clamp(this.hitFlash * 0.55, 0, 1));
    const cmotion = clamp(Math.hypot(this.vx || 0, this.vy || 0) / Math.max(1, this.maxSpeed), 0, 1);
    const crx = wr * (this.body==='long'?1.38:this.body==='oval'?1.14:this.body==='soft'?0.96:1.04) * (1 + cmotion * 0.07);
    const cry = wr * (this.body==='long'?0.60:this.body==='oval'?0.80:this.body==='soft'?0.94:0.80) * (1 - cmotion * 0.04);
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
'@

# ── PATCH 5: Creature.drawPart() full replacement ──
$p5 = Lines @'
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
'@

# ── PATCH 6: Player.drawMutationParts() full replacement ──
$p6 = Lines @'
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
'@

# ════════════════════════════════════════════════════════════════════
# PASS 1: Apply patches 1, 3, 6 (Player class — exact line numbers in baseline)
# Line numbers are 1-indexed in comments, 0-indexed in code:
#   Patch 1 INSERT AFTER: 0-indexed line 1009 (1-indexed 1010) — closing } of Player turn block
#   Patch 3 REPLACE: 0-indexed 1123–1163 — Player.draw body section (ctx.save through ctx.restore)
#   Patch 6 REPLACE: 0-indexed 1185–1304 — Player.drawMutationParts method
# ════════════════════════════════════════════════════════════════════

$lines = [System.IO.File]::ReadAllLines($file)
$out = [System.Collections.Generic.List[string]]::new()
$i = 0
while ($i -lt $lines.Count) {
    if ($i -eq 1009) {
        $out.Add($lines[$i])
        foreach ($ln in $p1) { $out.Add($ln) }
        $i++; continue
    }
    if ($i -eq 1123) {
        foreach ($ln in $p3) { $out.Add($ln) }
        $i = 1165; continue
    }
    if ($i -eq 1185) {
        foreach ($ln in $p6) { $out.Add($ln) }
        $i = 1311; continue
    }
    $out.Add($lines[$i])
    $i++
}
[System.IO.File]::WriteAllLines($file, $out)
Write-Host "Pass 1 done: $($out.Count) lines (was $($lines.Count))"

# ════════════════════════════════════════════════════════════════════
# PASS 2: Apply patches 2, 4, 5 (Creature class — find by string search since line numbers shifted)
# ════════════════════════════════════════════════════════════════════

$lines2 = [System.IO.File]::ReadAllLines($file)
$creatureAngleLine = -1
$creatureBodyStart = -1
$creatureBodyEnd   = -1
$drawPartStart     = -1
$drawPartEnd       = -1

for ($j = 0; $j -lt $lines2.Count; $j++) {
    $ln = $lines2[$j]
    # Creature angle: unique to Creature.update (Player uses T.PLAYER_TURN_RATE, not turnRate)
    if ($creatureAngleLine -eq -1 -and $j -gt 1500 -and $ln -match 'this\.angle \+= clamp\(d, -turnRate, turnRate\)') {
        $creatureAngleLine = $j
    }
    # Creature.draw body: "// body shape" comment, after line 1750
    if ($creatureBodyStart -eq -1 -and $j -gt 1750 -and $ln -match '^\s+// body shape') {
        $creatureBodyStart = $j
    }
    # ctx.restore() in Creature.draw — first restore after body shape
    if ($creatureBodyStart -ne -1 -and $creatureBodyEnd -eq -1 -and $j -gt $creatureBodyStart -and $ln -match '^\s+ctx\.restore\(\);') {
        $creatureBodyEnd = $j
    }
    # drawPart method: "  drawPart(ctx, part, r, fade) {" indented 2 spaces, after line 1800
    if ($drawPartStart -eq -1 -and $j -gt 1800 -and $ln -match '^  drawPart\(ctx, part, r, fade\) \{') {
        $drawPartStart = $j
    }
    # End of drawPart: "}" at column 0 (Creature class closing brace), after drawPartStart
    if ($drawPartStart -ne -1 -and $drawPartEnd -eq -1 -and $j -gt ($drawPartStart + 5) -and $ln -eq '}') {
        $drawPartEnd = $j
    }
}

Write-Host "Creature angle=$creatureAngleLine, bodyStart=$creatureBodyStart, bodyEnd=$creatureBodyEnd, drawPartStart=$drawPartStart, drawPartEnd=$drawPartEnd"

if ($creatureAngleLine -lt 0 -or $creatureBodyStart -lt 0 -or $creatureBodyEnd -lt 0 -or $drawPartStart -lt 0 -or $drawPartEnd -lt 0) {
    Write-Error "Could not find all Creature sections! Aborting."
    exit 1
}

$out2 = [System.Collections.Generic.List[string]]::new()
$j = 0
while ($j -lt $lines2.Count) {
    # PATCH 2: after creature angle line AND its closing brace
    if ($j -eq $creatureAngleLine) {
        $out2.Add($lines2[$j])   # this.angle += ...
        $j++
        $out2.Add($lines2[$j])   # }  (closing brace of if block)
        foreach ($ln in $p2) { $out2.Add($ln) }
        $j++; continue
    }
    # PATCH 4: replace body shape comment through ctx.restore()
    if ($j -eq $creatureBodyStart) {
        foreach ($ln in $p4) { $out2.Add($ln) }
        $j = $creatureBodyEnd + 1; continue
    }
    # PATCH 5: replace drawPart method
    if ($j -eq $drawPartStart) {
        foreach ($ln in $p5) { $out2.Add($ln) }
        $j = $drawPartEnd; continue  # keep the Creature class closing }
    }
    $out2.Add($lines2[$j])
    $j++
}
[System.IO.File]::WriteAllLines($file, $out2)
Write-Host "Pass 2 done: $($out2.Count) lines (was $($lines2.Count))"
