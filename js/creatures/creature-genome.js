window.DriftCreatures = window.DriftCreatures || {};

// ─── Tunable constants (editable via dev menu, persisted in localStorage) ────
window.DriftCreatures.tuning = (function () {
  var defaults = {
    speedBase:      10,   // genome speed lower bound at growth level 0
    speedMax:       36,   // genome speed upper bound at growth level 0
    speedGrowthMul: 1.10, // per growth level speed multiplier
    damageBase:     6,    // base bite/weapon damage
    damageGrowthMul:1.12, // per growth level damage multiplier
    turnBase:       1.20, // lower bound of maxTurnPerSec (rad/s)
    turnMax:        2.80, // upper bound of maxTurnPerSec (rad/s)
    turnGrowthMul:  1.06, // per growth level turn-rate multiplier
    awareBase:      70,   // lower bound of sightRange
    awareMax:       180,  // upper bound of sightRange
    awareGrowthMul: 1.08, // per growth level sightRange multiplier
  };
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem('drift.creature.tuning') || '{}'); } catch(e) {}
  // Migrate: old defaults (turnBase=0.22, turnMax=0.50) made creatures swim in
  // straight lines because they could barely turn. Reset to new defaults.
  if (typeof stored.turnBase === 'number' && stored.turnBase < 0.6) delete stored.turnBase;
  if (typeof stored.turnMax === 'number' && stored.turnMax < 1.0) delete stored.turnMax;
  var t = {};
  for (var k in defaults) t[k] = (k in stored && typeof stored[k] === 'number') ? stored[k] : defaults[k];
  t.defaults = defaults;
  t.save = function () {
    var out = {};
    for (var k in defaults) out[k] = t[k];
    try { localStorage.setItem('drift.creature.tuning', JSON.stringify(out)); } catch(e) {}
  };
  return t;
}());

window.DriftCreatures.generateCreatureGenome = function (seed, biomeTier) {
  biomeTier = biomeTier || 1;

  var D = window.DriftCreatures;
  var rand = D.mulberry32(seed);

  var movementStyle = D.pick(rand, ["wriggle", "pulse", "fin", "drift"]);
  var parts = [];
  var anchorPools = {
    eye: ["browLeft", "browRight", "crown"],
    mouth: ["nose", "mouthLeft", "mouthRight"],
    fin: ["flankUpperLeft", "flankUpperRight", "flankLowerLeft", "flankLowerRight"],
    tail: ["tailBase", "tailKnob"],
    weapon: ["crown", "dorsalFront", "dorsalRear", "nose"],
    defense: ["dorsalMid", "flankUpperLeft", "flankUpperRight", "ventralMid"],
    detail: ["cheekLeft", "cheekRight", "flankLowerLeft", "flankLowerRight", "crown"]
  };
  var mirroredLeftAnchorPools = {
    eye: ["browLeft", "cheekLeft"],
    fin: ["flankUpperLeft", "flankLowerLeft"],
    defense: ["flankUpperLeft", "flankLowerLeft"],
    detail: ["cheekLeft", "flankLowerLeft"]
  };

  function addPart(type, sizeMin, sizeMax, mirrored) {
    var anchors = (mirrored && mirroredLeftAnchorPools[type]) ? mirroredLeftAnchorPools[type] : (anchorPools[type] || ["center"]);
    parts.push({
      type: type,
      anchorRole: D.pick(rand, anchors),
      anchorBias: rand(),
      size: D.randRange(rand, sizeMin, sizeMax),
      mirrored: !!mirrored,
      variation: D.randInt(rand, 0, 5),
      phase: rand()
    });
  }

  addPart("eye", 3, 7, true);
  addPart("mouth", 5, 12, false);
  addPart("fin", 7, 17, true);
  addPart("detail", 3, 8, true);

  if (rand() > 0.38) addPart("tail", 7, 16, false);
  if (biomeTier >= 2 && rand() > 0.42) addPart("weapon", 5, 12, rand() > 0.6);
  if (biomeTier >= 2 && rand() > 0.38) addPart("defense", 6, 13, true);
  if (biomeTier >= 3 && rand() > 0.52) addPart("detail", 4, 10, true);

  return {
    seed: seed,

    body: {
      nodeCount:    D.randInt(rand, 10, 16),
      baseRadius:   D.randRange(rand, 12, 34) * (1 + biomeTier * 0.15),
      // Capped at 1.35: anything more elongated produced thin needle-like
      // silhouettes that the spine renderer rendered as crescents.
      elongation:   D.randRange(rand, 0.9, 1.35),
      asymmetry:    D.randRange(rand, 0, 0.08),
      softness:     D.randRange(rand, 0.48, 0.72),
      wobbleAmount: D.randRange(rand, 0.02, 0.2)
    },

    movement: {
      style:      movementStyle,
      speed:      D.randRange(rand, D.tuning.speedBase, D.tuning.speedMax) * (1 + biomeTier * 0.06),
      turnSpeed:  D.randRange(rand, D.tuning.turnBase, D.tuning.turnMax),
      effortCost: D.randRange(rand, 0.4, 1.2)
    },

    senses: {
      sightRange:     D.randRange(rand, D.tuning.awareBase, D.tuning.awareMax),
      smellRange:     D.randRange(rand, 120, 280),
      fearThreshold:  D.randRange(rand, 0.35, 0.85)
    },

    diet: {
      preferredFoodSize: D.randRange(rand, 0.4, 1.4),
      aggression:        D.randRange(rand, 0.1, 0.9),
      fleeBias:          D.randRange(rand, 0.2, 1.0)
    },

    growth: {
      juvenileScale: D.randRange(rand, 0.55, 0.8),
      adultScale:    D.randRange(rand, 1.0, 1.8),
      growthRate:    D.randRange(rand, 0.025, 0.08)
    },

    colors: {
      body:   D.pick(rand, ["#75d6ff", "#8ff0a4", "#f0a6ff", "#ffd36e", "#ff8f8f"]),
      accent: D.pick(rand, ["#ffffff", "#a8dadc", "#f8f9fa", "#bde0fe"]),
      detail: D.pick(rand, ["#0b132b", "#3a0ca3", "#264653", "#111111"])
    },

    parts: parts
  };
};
