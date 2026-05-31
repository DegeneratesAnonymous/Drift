window.DriftCreatures = window.DriftCreatures || {};

window.DriftCreatures.createCreature = function (seed, x, y, biomeTier) {
  var genome = window.DriftCreatures.generateCreatureGenome(seed, biomeTier || 1);
  return new window.DriftCreatures.Creature(genome, x, y);
};
