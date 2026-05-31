window.DriftCreatures = window.DriftCreatures || {};

var _dcCreatureIdCounter = 0;

// ─── Constructor ──────────────────────────────────────────────────────────────

window.DriftCreatures.Creature = function (genome, x, y) {
  var D = window.DriftCreatures;

  this.genome    = genome;
  this.idNumber  = ++_dcCreatureIdCounter;
  this.time      = 0;
  this.mood      = "calm";
  this.behavior  = "wander";
  this.target    = null;
  // Randomize initial facing so creatures don't all start pointing right.
  var _initA = ((this.idNumber * 2.39996) % (Math.PI * 2)) + (x * 0.0001) + (y * 0.0001);
  this.facing    = { x: Math.cos(_initA), y: Math.sin(_initA) };
  this.isPlayer  = false;
  this.label     = "";
  this.growthLevel = 0;
  this.growthPulse = 0;
  this.hitFlash = 0;
  this.eatenMark = 0;

  // Create body scaled to juvenile size from the start
  var juvenileRadius = genome.body.baseRadius * genome.growth.juvenileScale;
  this.body = D.createSoftBodyRing(
    x, y,
    juvenileRadius,
    genome.body.nodeCount,
    genome.body.elongation,
    genome.body.softness
  );
  this.body.pressure = Math.max(0.4, genome.body.softness);

  this.growth = D.createGrowthState(genome);

  this.parts = [];
  for (var i = 0; i < genome.parts.length; i++) {
    this.addPart(genome.parts[i]);
  }
};

// ─── Prototype methods ────────────────────────────────────────────────────────

window.DriftCreatures.Creature.prototype.addPart = function (gene) {
  var D         = window.DriftCreatures;
  var nodeCount = this.body.nodes.length;
  var anchor    = Math.floor(gene.anchorBias * nodeCount) % nodeCount;

  var part = D.createPartFromGene(gene, anchor);
  this.parts.push(part);

  if (gene.mirrored) {
    var mirrorAnchor = (anchor + Math.floor(nodeCount / 2)) % nodeCount;
    var mirrorGene = Object.assign({}, gene, {
      anchorRole: dcMirrorAnchorRole(gene.anchorRole),
      phase: ((gene.phase || 0) + 0.5) % 1
    });
    var mirrorPart   = D.createPartFromGene(mirrorGene, mirrorAnchor);
    this.parts.push(mirrorPart);
  }
};

window.DriftCreatures.Creature.prototype.update = function (dt, world, inputTarget) {
  var D = window.DriftCreatures;

  this.time += dt;

  if (this.isPlayer) {
    if (inputTarget) {
      this.target = { x: inputTarget.x, y: inputTarget.y };
      this.behavior = "playerControl";
      this.mood = "calm";
    } else {
      this.behavior = "idle";
      this.target = null;
    }
  } else {
    D.updateCreatureAI(this, world);
  }
  D.updateCreatureMovement(this, dt, inputTarget);
  D.updateGrowth(this.growth, this.body, dt);
  this.growthPulse = Math.max(0, this.growthPulse - dt * 1.6);
  this.eatenMark = Math.max(0, this.eatenMark - dt * 1.4);

  var nextLevel = Math.floor((this.growth.growthProgress || 0) * 8);
  if (nextLevel > this.growthLevel) {
    this.growthLevel = nextLevel;
    this.growthPulse = Math.min(1.2, this.growthPulse + 0.55);
  }

  for (var pi = 0; pi < this.parts.length; pi++) {
    var part = this.parts[pi];
    if (part.growth < 1) {
      part.growth = Math.min(1, part.growth + dt * 0.18);
      part.active = part.growth >= 0.5;
    }
    D.updateCreaturePart(part, dt);
  }

  dcApplyMoodMotion(this, dt);

  D.updateSoftBody(this.body, dt, 3);
  if (typeof D.dampenSoftBodySpin === "function") {
    D.dampenSoftBodySpin(this.body, 0.82);
  }

  var center = D.getBodyCenter(this.body);
  var prevCenter = this._lastCenter || center;
  var jumpX = center.x - prevCenter.x;
  var jumpY = center.y - prevCenter.y;
  var jumpDist = Math.sqrt(jumpX * jumpX + jumpY * jumpY);
  var maxJump = Math.max(10, this.getEffectiveSpeed() * Math.max(dt, 0.001) * 2.4 + this.getApproxSize() * 0.35);
  if (jumpDist > maxJump) {
    var keep = maxJump / jumpDist;
    var correctedX = prevCenter.x + jumpX * keep;
    var correctedY = prevCenter.y + jumpY * keep;
    D.translateSoftBody(this.body, correctedX - center.x, correctedY - center.y);
    center = { x: correctedX, y: correctedY };
  }
  this._lastCenter = { x: center.x, y: center.y };
};

window.DriftCreatures.Creature.prototype.render = function (ctx) {
  window.DriftCreatures.renderCreature(ctx, this);
};

window.DriftCreatures.Creature.prototype.getApproxSize = function () {
  var D      = window.DriftCreatures;
  var center = D.getBodyCenter(this.body);
  var total  = 0;
  for (var i = 0; i < this.body.nodes.length; i++) {
    var node = this.body.nodes[i];
    var dx = node.x - center.x;
    var dy = node.y - center.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total / this.body.nodes.length;
};

window.DriftCreatures.Creature.prototype.getEffectiveSpeed = function () {
  var D     = window.DriftCreatures;
  var bonus = 0;
  for (var i = 0; i < this.parts.length; i++) {
    if (!this.parts[i].active) continue;
    bonus += D.getPartEffect(this.parts[i].type).speedBonus;
  }
  var growthMul = Math.pow(D.tuning.speedGrowthMul, this.growthLevel || 0);
  return this.genome.movement.speed * Math.max(0.35, 1 + bonus) * growthMul;
};

window.DriftCreatures.Creature.prototype.getEffectiveDamage = function () {
  var D = window.DriftCreatures;
  var growthMul = Math.pow(D.tuning.damageGrowthMul, this.growthLevel || 0);
  return D.tuning.damageBase * growthMul;
};

window.DriftCreatures.Creature.prototype.getEffectiveTurnMax = function () {
  var D = window.DriftCreatures;
  var growthMul = Math.pow(D.tuning.turnGrowthMul, this.growthLevel || 0);
  return Math.min(D.tuning.turnMax * growthMul, 4.0);
};

window.DriftCreatures.Creature.prototype.getEffectiveSenseRange = function () {
  var D     = window.DriftCreatures;
  var bonus = 0;
  for (var i = 0; i < this.parts.length; i++) {
    if (!this.parts[i].active) continue;
    bonus += D.getPartEffect(this.parts[i].type).senseBonus;
  }
  var growthMul = Math.pow(D.tuning.awareGrowthMul, this.growthLevel || 0);
  return this.genome.senses.sightRange * Math.max(0.5, 1 + bonus) * growthMul;
};

window.DriftCreatures.Creature.prototype.setPlayerControlled = function () {
  this.isPlayer = true;
  this.label = "You";
  this.genome.colors.body = "#6ee7ff";
  this.genome.colors.accent = "#fff4a3";
  this.genome.colors.detail = "#16324a";
  this.genome.movement.speed *= 1.35;
  this.genome.senses.sightRange *= 1.15;
  return this;
};

// ─── Mood-driven physical effects (module-private) ────────────────────────────

function dcApplyMoodMotion(creature, dt) {
  var D = window.DriftCreatures;

  if (creature.mood === "afraid") {
    var shake = Math.sin(creature.time * 40) * 0.3;
    for (var i = 0; i < creature.body.nodes.length; i++) {
      creature.body.nodes[i].x += shake;
      creature.body.nodes[i].y -= shake;
    }
  }

  if (creature.mood === "feeding") {
    D.queueBodyGrowth(creature.growth, dt * 0.015);
    creature.eatenMark = Math.min(1.2, (creature.eatenMark || 0) + dt * 1.1);
  }
}

function dcMirrorAnchorRole(role) {
  if (!role) return role;
  if (role.indexOf("Left") >= 0) return role.replace("Left", "Right");
  if (role.indexOf("Right") >= 0) return role.replace("Right", "Left");
  return role;
}
