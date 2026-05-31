window.DriftCreatures = window.DriftCreatures || {};

window.DriftCreatures.mulberry32 = function (seed) {
  return function () {
    var t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

window.DriftCreatures.randRange = function (rand, min, max) {
  return min + rand() * (max - min);
};

window.DriftCreatures.randInt = function (rand, min, max) {
  return Math.floor(window.DriftCreatures.randRange(rand, min, max + 1));
};

window.DriftCreatures.pick = function (rand, values) {
  return values[Math.floor(rand() * values.length)];
};
