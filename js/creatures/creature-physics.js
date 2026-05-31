window.DriftCreatures = window.DriftCreatures || {};

// ─── Soft body creation ───────────────────────────────────────────────────────

window.DriftCreatures.createSoftBodyRing = function (x, y, radius, nodeCount, elongation, stiffness) {
  var nodes = [];
  var constraints = [];
  var TAU = Math.PI * 2;

  for (var i = 0; i < nodeCount; i++) {
    var angle = (i / nodeCount) * TAU;
    var rx = Math.cos(angle) * radius * (elongation || 1);
    var ry = Math.sin(angle) * radius;
    nodes.push({
      x: x + rx,
      y: y + ry,
      prevX: x + rx,
      prevY: y + ry,
      vx: 0,
      vy: 0,
      mass: 1
    });
  }

  // Adjacent ring constraints
  for (var i = 0; i < nodeCount; i++) {
    var a = i;
    var b = (i + 1) % nodeCount;
    var dx = nodes[b].x - nodes[a].x;
    var dy = nodes[b].y - nodes[a].y;
    constraints.push({
      a: a,
      b: b,
      rest: Math.sqrt(dx * dx + dy * dy),
      stiffness: stiffness || 0.8
    });
  }

  // Cross-body stabilising constraints (skip ~1/3 around)
  var skip = Math.max(2, Math.floor(nodeCount / 3));
  for (var i = 0; i < nodeCount; i++) {
    var a = i;
    var b = (i + skip) % nodeCount;
    var dx = nodes[b].x - nodes[a].x;
    var dy = nodes[b].y - nodes[a].y;
    constraints.push({
      a: a,
      b: b,
      rest: Math.sqrt(dx * dx + dy * dy),
      stiffness: (stiffness || 0.8) * 0.45
    });
  }

  return { nodes: nodes, constraints: constraints, pressure: 1.0 };
};

// ─── Per-frame update ─────────────────────────────────────────────────────────

window.DriftCreatures.updateSoftBody = function (body, dt, iterations) {
  var D = window.DriftCreatures;
  var damping = 0.985;

  for (var k = 0; k < body.nodes.length; k++) {
    var node = body.nodes[k];
    var vx = (node.x - node.prevX) * damping;
    var vy = (node.y - node.prevY) * damping;
    node.prevX = node.x;
    node.prevY = node.y;
    // Movement code already scales impulses by dt, so applying dt again here
    // makes steering nearly inert.
    node.x += vx + node.vx;
    node.y += vy + node.vy;
    node.vx = 0;
    node.vy = 0;
  }

  var iters = iterations || 3;
  for (var it = 0; it < iters; it++) {
    D.solveSoftBodyConstraints(body);
    D.applySoftBodyPressure(body);
  }
};

window.DriftCreatures.solveSoftBodyConstraints = function (body) {
  for (var ci = 0; ci < body.constraints.length; ci++) {
    var c = body.constraints[ci];
    var a = body.nodes[c.a];
    var b = body.nodes[c.b];
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var diff = (dist - c.rest) / dist * c.stiffness * 0.5;
    a.x += dx * diff;
    a.y += dy * diff;
    b.x -= dx * diff;
    b.y -= dy * diff;
  }
};

window.DriftCreatures.applySoftBodyPressure = function (body) {
  var nodes = body.nodes;
  var n = nodes.length;

  // Shoelace area
  var area = 0;
  for (var i = 0; i < n; i++) {
    var a = nodes[i];
    var b = nodes[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  area = Math.abs(area) * 0.5;

  // Target area from first ring-constraint rest length
  var restLen = body.constraints.length > 0 ? body.constraints[0].rest : 20;
  var approxRadius = (restLen * n) / (Math.PI * 2);
  var targetArea = body.pressure * Math.PI * approxRadius * approxRadius;
  var ratio = targetArea / (area || 1);

  var cx = 0, cy = 0;
  for (var i = 0; i < n; i++) { cx += nodes[i].x; cy += nodes[i].y; }
  cx /= n; cy /= n;

  var push = (ratio - 1) * 0.04;
  for (var i = 0; i < n; i++) {
    nodes[i].x += (nodes[i].x - cx) * push;
    nodes[i].y += (nodes[i].y - cy) * push;
  }
};

// ─── Utilities ────────────────────────────────────────────────────────────────

window.DriftCreatures.getBodyCenter = function (body) {
  var nodes = body.nodes;
  var sx = 0, sy = 0;
  for (var i = 0; i < nodes.length; i++) { sx += nodes[i].x; sy += nodes[i].y; }
  return { x: sx / nodes.length, y: sy / nodes.length };
};

window.DriftCreatures.applyForceToBody = function (body, fx, fy) {
  var share = 1 / body.nodes.length;
  for (var i = 0; i < body.nodes.length; i++) {
    body.nodes[i].vx += fx * share;
    body.nodes[i].vy += fy * share;
  }
};

window.DriftCreatures.translateSoftBody = function (body, dx, dy) {
  for (var i = 0; i < body.nodes.length; i++) {
    body.nodes[i].x += dx;
    body.nodes[i].y += dy;
    body.nodes[i].prevX += dx;
    body.nodes[i].prevY += dy;
  }
};

window.DriftCreatures.applyForceToNode = function (body, index, fx, fy) {
  var node = body.nodes[index % body.nodes.length];
  if (node) {
    node.vx += fx;
    node.vy += fy;
  }
};

window.DriftCreatures.dampenSoftBodySpin = function (body, amount) {
  var keep = Math.max(0, Math.min(1, 1 - (amount || 0)));
  var center = window.DriftCreatures.getBodyCenter(body);
  var inertia = 0;
  var angularMomentum = 0;

  for (var i = 0; i < body.nodes.length; i++) {
    var node = body.nodes[i];
    var rx = node.x - center.x;
    var ry = node.y - center.y;
    var vx = node.x - node.prevX;
    var vy = node.y - node.prevY;
    var r2 = rx * rx + ry * ry;
    inertia += r2;
    angularMomentum += rx * vy - ry * vx;
  }

  if (inertia < 0.0001) return;
  var omega = angularMomentum / inertia;
  var removeOmega = omega * (1 - keep);

  for (var i = 0; i < body.nodes.length; i++) {
    var node = body.nodes[i];
    var rx = node.x - center.x;
    var ry = node.y - center.y;
    var rvx = -ry * removeOmega;
    var rvy = rx * removeOmega;
    node.prevX += rvx;
    node.prevY += rvy;
  }
};

window.DriftCreatures.rotateBodyToward = function (body, targetAngle, amount) {
  var center = window.DriftCreatures.getBodyCenter(body);
  var currentAngle = window.DriftCreatures.getBodyOrientation(body);
  var delta = targetAngle - currentAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  var rot = delta * amount;
  if (Math.abs(rot) < 0.00001) return;
  var cs = Math.cos(rot);
  var sn = Math.sin(rot);

  for (var i = 0; i < body.nodes.length; i++) {
    var node = body.nodes[i];
    var dx = node.x - center.x;
    var dy = node.y - center.y;
    var pdx = node.prevX - center.x;
    var pdy = node.prevY - center.y;
    node.x = center.x + dx * cs - dy * sn;
    node.y = center.y + dx * sn + dy * cs;
    node.prevX = center.x + pdx * cs - pdy * sn;
    node.prevY = center.y + pdx * sn + pdy * cs;
  }
};

window.DriftCreatures.getBodyOrientation = function (body) {
  var center = window.DriftCreatures.getBodyCenter(body);
  var sxx = 0, syy = 0, sxy = 0;
  for (var i = 0; i < body.nodes.length; i++) {
    var dx = body.nodes[i].x - center.x;
    var dy = body.nodes[i].y - center.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy || 0.0001);
};

window.DriftCreatures.resolveCreatureCollisions = function (creatures, iterations) {
  var steps = iterations || 2;

  for (var step = 0; step < steps; step++) {
    for (var ai = 0; ai < creatures.length; ai++) {
      for (var bi = ai + 1; bi < creatures.length; bi++) {
        var a = creatures[ai];
        var b = creatures[bi];
        var centerA = window.DriftCreatures.getBodyCenter(a.body);
        var centerB = window.DriftCreatures.getBodyCenter(b.body);
        var dx = centerB.x - centerA.x;
        var dy = centerB.y - centerA.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        var sizeA = a.getApproxSize();
        var sizeB = b.getApproxSize();
        var minCenter = (sizeA + sizeB) * 0.92;

        if (dist < minCenter) {
          var overlap = minCenter - dist;
          var nx = dx / dist;
          var ny = dy / dist;
          var pushA = overlap * 0.5;
          var pushB = overlap * 0.5;

          for (var ani = 0; ani < a.body.nodes.length; ani++) {
            a.body.nodes[ani].x -= nx * pushA;
            a.body.nodes[ani].y -= ny * pushA;
            a.body.nodes[ani].prevX -= nx * pushA;
            a.body.nodes[ani].prevY -= ny * pushA;
          }
          for (var bni = 0; bni < b.body.nodes.length; bni++) {
            b.body.nodes[bni].x += nx * pushB;
            b.body.nodes[bni].y += ny * pushB;
            b.body.nodes[bni].prevX += nx * pushB;
            b.body.nodes[bni].prevY += ny * pushB;
          }
        }

        var nodePadding = Math.max(5, Math.min(sizeA, sizeB) * 0.18);
        for (var ani = 0; ani < a.body.nodes.length; ani++) {
          var nodeA = a.body.nodes[ani];
          for (var bni = 0; bni < b.body.nodes.length; bni++) {
            var nodeB = b.body.nodes[bni];
            var ndx = nodeB.x - nodeA.x;
            var ndy = nodeB.y - nodeA.y;
            var ndist = Math.sqrt(ndx * ndx + ndy * ndy) || 0.0001;
            if (ndist >= nodePadding) continue;

            var noverlap = (nodePadding - ndist) * 0.5;
            var nnx = ndx / ndist;
            var nny = ndy / ndist;
            nodeA.x -= nnx * noverlap;
            nodeA.y -= nny * noverlap;
            nodeA.prevX -= nnx * noverlap;
            nodeA.prevY -= nny * noverlap;
            nodeB.x += nnx * noverlap;
            nodeB.y += nny * noverlap;
            nodeB.prevX += nnx * noverlap;
            nodeB.prevY += nny * noverlap;
          }
        }

        window.DriftCreatures.solveSoftBodyConstraints(a.body);
        window.DriftCreatures.solveSoftBodyConstraints(b.body);
        window.DriftCreatures.applySoftBodyPressure(a.body);
        window.DriftCreatures.applySoftBodyPressure(b.body);
      }
    }
  }
};
