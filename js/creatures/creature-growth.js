window.DriftCreatures = window.DriftCreatures || {};

// ─── Growth state factory ─────────────────────────────────────────────────────

window.DriftCreatures.createGrowthState = function (genome) {
  return {
    currentScale:   genome.growth.juvenileScale,
    juvenileScale:  genome.growth.juvenileScale,
    adultScale:     genome.growth.adultScale,
    growthRate:     genome.growth.growthRate,
    growthProgress: 0,
    pendingGrowth:  0,
    isAdult:        false
  };
};

// ─── Per-frame growth update ──────────────────────────────────────────────────

window.DriftCreatures.updateGrowth = function (growth, body, dt) {
  var D = window.DriftCreatures;

  // Drain queued growth (e.g. from eating)
  if (growth.pendingGrowth > 0) {
    var chunk = Math.min(growth.pendingGrowth, dt * 0.06);
    growth.growthProgress = Math.min(1, growth.growthProgress + chunk);
    growth.pendingGrowth -= chunk;
  }

  // Natural growth over time
  if (!growth.isAdult) {
    growth.growthProgress = Math.min(1, growth.growthProgress + dt * growth.growthRate * 0.08);
    if (growth.growthProgress >= 1) {
      growth.growthProgress = 1;
      growth.isAdult = true;
    }
  }

  // Scale body to match growth progress
  var newScale = growth.juvenileScale + (growth.adultScale - growth.juvenileScale) * growth.growthProgress;
  if (Math.abs(newScale - growth.currentScale) > 0.001) {
    var ratio = newScale / (growth.currentScale || newScale);
    D.scaleSoftBody(body, ratio);
    growth.currentScale = newScale;
  }
};

// ─── Queue a one-shot growth burst ───────────────────────────────────────────

window.DriftCreatures.queueBodyGrowth = function (growth, amount) {
  growth.pendingGrowth = (growth.pendingGrowth || 0) + amount;
};

// ─── Scale all nodes and constraint rests around the body center ──────────────

window.DriftCreatures.scaleSoftBody = function (body, ratio) {
  var D = window.DriftCreatures;
  var center = D.getBodyCenter(body);

  for (var i = 0; i < body.nodes.length; i++) {
    var node = body.nodes[i];
    node.x     = center.x + (node.x     - center.x) * ratio;
    node.y     = center.y + (node.y     - center.y) * ratio;
    node.prevX = center.x + (node.prevX - center.x) * ratio;
    node.prevY = center.y + (node.prevY - center.y) * ratio;
  }

  for (var ci = 0; ci < body.constraints.length; ci++) {
    body.constraints[ci].rest *= ratio;
  }
};
