window.DriftCreatures = window.DriftCreatures || {};

window.DriftCreatures.updateCreatureAI = function (creature, world) {
  var D = window.DriftCreatures;
  var center = D.getBodyCenter(creature.body);

  if (!world) {
    dcSetWander(creature, center);
    return;
  }

  // ── Find nearest food ────────────────────────────────────────────────────────
  var nearestFood = null;
  var nearestFoodDist = Infinity;
  var senseRange = creature.getEffectiveSenseRange();

  if (world.food) {
    for (var fi = 0; fi < world.food.length; fi++) {
      var food = world.food[fi];
      var fdx = food.x - center.x;
      var fdy = food.y - center.y;
      var fdist = Math.sqrt(fdx * fdx + fdy * fdy);
      if (fdist < senseRange && fdist < nearestFoodDist) {
        nearestFood = food;
        nearestFoodDist = fdist;
      }
    }
  }

  // ── Find nearest threat ──────────────────────────────────────────────────────
  var nearestEnemy = null;
  var nearestEnemyDist = Infinity;
  var nearestEnemySize = 0;
  var mySize = creature.getApproxSize();

  if (world.creatures) {
    for (var ci = 0; ci < world.creatures.length; ci++) {
      var other = world.creatures[ci];
      if (other === creature) continue;

      var otherCenter = D.getBodyCenter(other.body);
      var edx = otherCenter.x - center.x;
      var edy = otherCenter.y - center.y;
      var edist = Math.sqrt(edx * edx + edy * edy);
      var otherSize = other.getApproxSize();

      if (edist < senseRange && edist < nearestEnemyDist) {
        nearestEnemy = other;
        nearestEnemyDist = edist;
        nearestEnemySize = otherSize;
      }
    }
  }

  // ── Decide behaviour ─────────────────────────────────────────────────────────
    var fearThreshold = creature.genome.senses.fearThreshold;
  var isThreatened = nearestEnemy &&
    nearestEnemySize > mySize * (1 / (fearThreshold || 0.5)) &&
    nearestEnemyDist < senseRange * 0.65;

  if (isThreatened) {
    creature.behavior = "flee";
    creature.mood = "afraid";
    var enemyCenter = D.getBodyCenter(nearestEnemy.body);
    var edx = center.x - enemyCenter.x;
    var edy = center.y - enemyCenter.y;
    var elen = Math.sqrt(edx * edx + edy * edy) || 1;
    creature.target = {
      x: center.x + (edx / elen) * 220,
      y: center.y + (edy / elen) * 220
    };
  } else if (nearestFood) {
    creature.behavior = "seekFood";
    creature.mood = "hungry";
    creature.target = nearestFood;
  } else {
    dcSetWander(creature, center);
  }
};

function dcSetWander(creature, center) {
  if (!creature.target || Math.random() < 0.005) {
    var angle = Math.random() * Math.PI * 2;
    var dist  = 60 + Math.random() * 140;
    creature.target = {
      x: center.x + Math.cos(angle) * dist,
      y: center.y + Math.sin(angle) * dist
    };
  }
  creature.behavior = "wander";
  creature.mood     = "calm";
}
