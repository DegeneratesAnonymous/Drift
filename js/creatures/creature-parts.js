window.DriftCreatures = window.DriftCreatures || {};

// ─── Part creation ────────────────────────────────────────────────────────────

window.DriftCreatures.createPartFromGene = function (gene, anchorNodeIndex) {
  return {
    type:       gene.type,
    anchorNode: anchorNodeIndex,
    anchorRole: gene.anchorRole || "center",
    size:       gene.size || 8,
    growth:     0,
    active:     false,
    angle:      0,
    animTime:   0,
    variation:  gene.variation || 0,
    phase:      gene.phase || 0
  };
};

// ─── Per-frame part update ────────────────────────────────────────────────────

window.DriftCreatures.updateCreaturePart = function (part, dt) {
  part.animTime += dt;

  if (part.type === "fin") {
    part.angle = Math.sin(part.animTime * (2.3 + (part.variation % 5) * 0.1) + part.phase * 4) * 0.11;
  } else if (part.type === "tail") {
    part.angle = Math.sin(part.animTime * (1.7 + (part.variation % 6) * 0.08) + part.phase * 3.2) * 0.15;
  } else if (part.type === "weapon") {
    part.angle = Math.sin(part.animTime * 1.4 + part.phase * 2.2) * 0.03;
  } else if (part.type === "defense") {
    part.angle = Math.sin(part.animTime * 1.2 + part.phase * 1.9) * 0.02;
  } else if (part.type === "herbivoreMouth" || part.type === "carnivoreMouth" || part.type === "omnivoreMouth") {
    part.angle = Math.sin(part.animTime * 2.0 + part.phase * 4.5) * 0.03;
  } else if (part.type === "mouth") {
    // Backward compatibility with older saves/proxies
    part.angle = Math.sin(part.animTime * 2.0 + part.phase * 4.5) * 0.03;
  }
};

// ─── Stat bonuses per part type ───────────────────────────────────────────────

window.DriftCreatures.getPartEffect = function (type) {
  if (type === "fin")           return { speedBonus: 0.18,  senseBonus: 0,    damageBonus: 0,    defenseBonus: 0    };
  if (type === "eye")           return { speedBonus: 0,     senseBonus: 0.25, damageBonus: 0,    defenseBonus: 0    };
  if (type === "herbivoreMouth") return { speedBonus: 0.04, senseBonus: 0.05, damageBonus: 0.04, defenseBonus: 0.02 };
  if (type === "carnivoreMouth") return { speedBonus: -0.02, senseBonus: 0, damageBonus: 0.26, defenseBonus: 0.01 };
  if (type === "omnivoreMouth") return { speedBonus: 0.01, senseBonus: 0.02, damageBonus: 0.16, defenseBonus: 0.01 };
  if (type === "weapon")        return { speedBonus: -0.03, senseBonus: 0,    damageBonus: 0.30, defenseBonus: 0.10 };
  if (type === "defense")       return { speedBonus: -0.08, senseBonus: 0,    damageBonus: 0,    defenseBonus: 0.35 };
  if (type === "tail")          return { speedBonus: 0.12,  senseBonus: 0.03, damageBonus: 0.08, defenseBonus: 0    };
  if (type === "mouth")         return { speedBonus: 0.01,  senseBonus: 0.02, damageBonus: 0.16, defenseBonus: 0.01 };
  return { speedBonus: 0, senseBonus: 0, damageBonus: 0, defenseBonus: 0 };
};
