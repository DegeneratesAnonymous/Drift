window.DriftCreatures = window.DriftCreatures || {};

window.DriftCreatures.debug = {
  creaturePhysics:     false,
  creatureConstraints: false,
  creatureAI:          false,
  creatureGrowth:      false
};

window.DriftCreatures.renderCreatureDebug = function (ctx, creature) {
  var debug = window.DriftCreatures.debug;
  var body  = creature.body;

  if (debug.creatureConstraints) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth   = 1;
    for (var ci = 0; ci < body.constraints.length; ci++) {
      var c = body.constraints[ci];
      var a = body.nodes[c.a];
      var b = body.nodes[c.b];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (debug.creaturePhysics) {
    ctx.save();
    ctx.fillStyle = "#ff00ff";
    for (var ni = 0; ni < body.nodes.length; ni++) {
      var node = body.nodes[ni];
      ctx.beginPath();
      ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (debug.creatureAI) {
    var center = window.DriftCreatures.getBodyCenter(body);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font      = "11px monospace";
    ctx.fillText(creature.behavior + " / " + creature.mood, center.x + 12, center.y - 12);
    if (creature.target) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(creature.target.x, creature.target.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (debug.creatureGrowth) {
    var center = window.DriftCreatures.getBodyCenter(body);
    ctx.save();
    ctx.fillStyle = "#dff";
    ctx.font      = "11px monospace";
    ctx.fillText(
      "growth " + Math.round(creature.growth.growthProgress * 100) + "%",
      center.x + 12,
      center.y + 4
    );
    ctx.restore();
  }
};
