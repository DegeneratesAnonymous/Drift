# Work Order

**ID / Reference:** WO-PROC-CREATURES-01
**Date:** 2026-05-28
**Author:** Coleman Daugherty
**Priority:** High

---

### Goal

Replace Drift's rigid, sprite-part creature rendering with **procedurally animated, physics-driven bodies** that **grow morphologically in a natural-looking way** as a creature gains size/complexity.

Three reference techniques drive the design:

1. **Chain-of-nodes spine + procedural appendages** — *"A simple procedural animation technique"* (`https://www.youtube.com/watch?v=qlfh_rv6khY`). A body is a chain of joints; each trails the one ahead at a fixed distance with a max-bend angle constraint. The silhouette is drawn around the chain; eyes/fins/limbs attach to specific nodes; limbs use IK-style stepping.
2. **Pressurized soft body (Verlet)** — *"Simulating soft body animals"* (`https://www.youtube.com/watch?v=GXh0Vxg7AnQ`). A closed loop of point masses connected by springs with an internal pressure/area-preservation force, integrated with Verlet. Produces squishy, wobbling amoeba/jelly motion.
3. **Cellular-automata growth** — *"Cellular Automata: Life from Simple Rules"* (`https://www.youtube.com/watch?v=wbPgoZ2d0Nw`). Simple local rules drive emergent structure. Used here to grow the body form (elongate spine, sprout appendage chains, develop skin markings) instead of popping flat parts into existence.

---

### Research & Context

**Current implementation (audited in `game.js`):**

- `Creature.draw()` (`game.js:2135`) renders one rigid shape under `ctx.translate(sx,sy); ctx.rotate(this.angle)`. Body kinds `oval` / `long` / `soft` / `round` are each a single `ellipse`/`arc`/12-point blob. A `wobble` sine and a `tail` sine are the only "animation."
- `Creature.drawPart()` (`game.js:2250`) draws each entry of `this.parts` (`cilia`, `tail`, `eyespot`, `spike`, `plate`, `fin`, `mandible`, `filtermouth`, `frill`, `tendril`) as a static decoration relative to body center. Supported set is validated in `validateCreaturePartVisuals()` (`game.js:823`).
- Growth: `_refreshGrowthLevel()` (`game.js:1557`) bumps `growthLevel` from the `r/baseR` ratio; `_addComplexityPoint()` (`game.js:1566`) just `push`es another part-name string from a diet pool. This is the root cause of "unnatural" growth — parts appear instantly with no structural continuity.
- Templates: `CREATURE_TEMPLATES` (`game.js:726`) define `body`, `parts`, `diet`, `sizeRange`, behavior. Legendary variants (`LEGENDARY_BASES`, `game.js:807`) add `unique` rendering flags (`glass`, `lantern`, `coil`, `many_eyed`, `pale`).
- **Existing reusable prior art:** the flora `branches` system (`game.js:2605`–`2776`) already stores `nodes:[{x,y,vx,vy,r,baseLen,parent}]` and integrates them every frame with bounding-radius recompute. This proves per-node physics fits the frame budget and gives a concrete pattern to copy.
- Loop (`game.js:5296`): variable `dt` clamped to `T.DT_MAX` (no fixed-timestep accumulator). Verlet/spring sims need sub-stepping for stability — do it **inside** the body update, not by changing the main loop.
- Culling: `getRenderRadius()` (`game.js:4653`); creatures already early-out in `draw()` when off-screen, and carry a `this.distantUpdate` flag (`game.js:1500`) for cheap far-field updates.
- Eating: `getMouthAnchor()` (`game.js:5510`) returns where carried food is pulled to — must follow the new head/mouth node.

**Key design decision (non-negotiable — see Notes):** the procedural body is a **cosmetic layer** attached to the authoritative `Entity` point. Gameplay keeps reading `this.x/this.y/this.vx/this.vy/this.angle/this.r`. Collision, AI, seeded spawns, reproduction, and saves are unaffected.

---

### Project Context

- **Tech stack:** static HTML + one large `game.js` (~272 KB). No build, no framework, no network at runtime. Plain Canvas 2D.
- **Constraints (`AGENTS.md`):** preserve save key `drift.micro-eco.v1`; preserve seed replay via `index.html?seed=...`; stay static/offline; prefer small reviewable diffs over rewrites of `game.js`.
- **Determinism:** runs are seed-replayable. Anything that affects entity position/AI must stay seeded and dt-stable. Therefore the cosmetic body sim must **not** feed back into gameplay state.
- **Save compat:** do **not** serialize per-node physics state. Creatures reconstruct their body from `templateId + growthLevel + a stored body seed` on load. Add at most one new persisted field (a per-creature `bodySeed`); default it from existing data if absent (old saves still load).

---

### Scope

**In scope:**

- [ ] **P0 — Scaffolding & decoupling.** Add a `CreatureBody` cosmetic module owned by each `Creature`. Introduce a feature flag `T.PROC_BODY` (default `false`). When off, rendering is byte-for-byte the current behavior. Add a `bodySeed` (deterministic from existing creature seed) for reproducible body generation.
- [ ] **P1 — Spine chain (video 1).** For `oval`/`long`/`spine`-class bodies, build a chain of N nodes trailing the head. Head node is driven from authoritative `x,y,angle`; each subsequent node applies a distance constraint + max-bend angle constraint. Render the silhouette as a smooth outline around the per-node radii. Derive `this.angle`-relative part anchor nodes so existing parts attach to the moving body.
- [ ] **P2 — Soft body (video 2).** For `soft`/`round`-class bodies (drifter, grazer, amoebic micro-organisms), build a closed Verlet loop with perimeter springs + internal pressure (area-preservation) force. Sub-step the integrator for stability. The loop's center is pinned to the authoritative point; the membrane squishes against motion and "breathes."
- [ ] **P3 — Procedural appendages.** Re-express `parts` as anchored sub-chains rather than static decorations: `tail`/`tendril`/`cilia`/`fin` become short trailing node chains on a parent body node; `spike`/`plate`/`mandible`/`filtermouth`/`eyespot` become node-anchored rigid attachments that inherit the local tangent/normal. Any future "leg" uses IK foot-stepping (plant foot, step when stretched past threshold).
- [ ] **P4 — CA-driven growth (video 3).** Rework `_addComplexityPoint()`/`_refreshGrowthLevel()` so growth mutates the **body structure** via simple local rules: lengthen the spine / add membrane points, sprout an appendage chain at an eligible node when neighbor conditions are met, and evolve a small per-creature cellular-automata pattern used to tint skin markings. Growth should animate in (interpolate node count / appendage scale over a short grow-in) instead of popping.
- [ ] **P5 — LOD, perf, mouth, verification.** Rigid-fallback draw for `distantUpdate`/off-screen creatures (skip the sim). Cap node counts. Update `getMouthAnchor()` to use the head/mouth node. Keep legendary `unique` effects working. Run `docs/VERIFYING.md`.

**Out of scope:**

- Changing creature AI, movement, collision, hunger/survival math, or spawn/seed logic.
- Changing the save schema beyond adding the single optional `bodySeed` field.
- 3D, WebGL, or any new rendering backend / library / build step.
- Reworking flora (`PlantStructure`/`branches`) — only borrow its node pattern.
- Player avatar restyle (can be a fast-follow once `CreatureBody` is proven on NPCs).

---

### Acceptance Criteria

- [ ] With `T.PROC_BODY=false`, the game renders identically to `main` (visual diff / screenshot parity on a fixed seed).
- [ ] With `T.PROC_BODY=true`: `oval`/`long` creatures show a flexible spine that bends and trails as they turn; `soft`/`round` creatures visibly squish/wobble as a pressurized membrane.
- [ ] Appendages (tail, fins, cilia, tendrils) move as physical extensions of the body, anchored to and inheriting motion from their parent node — not as fixed sprites.
- [ ] As a creature grows (growthLevel increases), its body **structurally** changes — spine lengthens / membrane gains points / a new appendage sprouts and scales in over ~0.5–1 s — rather than a part instantly appearing.
- [ ] Skin markings derive from a per-creature CA pattern seeded by `bodySeed`; the same seed reproduces the same creature across reloads.
- [ ] Gameplay is unchanged: collisions, eating (`getMouthAnchor` follows the mouth node), AI targeting, reproduction, and **seeded replay outcomes** match `main` for the same seed (creature positions/HP/kills identical; only visuals differ).
- [ ] Old saves under `drift.micro-eco.v1` load without error; creatures missing `bodySeed` derive a stable default.
- [ ] No new build/server/network dependency. `game.js` parses with no syntax errors.
- [ ] Frame time with the proc body on is within budget at a full on-screen creature count (target: no worse than ~1.5 ms/frame added at typical density; distant creatures use the rigid fallback).
- [ ] Legendary `unique` rendering (`glass`, `lantern`, `coil`, `many_eyed`, `pale`) still renders.

---

### Test Plan

| Level | Description |
|---|---|
| Unit | Spine distance/angle constraints converge and never NaN; pressure force keeps membrane area within bounds; CA step is deterministic for a given `bodySeed`; appendage chains stay attached after constraint solve. |
| Integration | `getMouthAnchor` returns the head/mouth node position; carried food tracks the animated mouth; growth path `_refreshGrowthLevel → structural change` fires once per level. |
| E2E | Fixed-seed run with `PROC_BODY=false` vs `true`: confirm identical entity positions/HP/kill log (gameplay parity), differing only in rendering. Reload mid-run; confirm creatures regenerate identical bodies from `bodySeed`. Old-save load test. |
| Security | N/A (no input/network/auth surface added). Confirm no `eval`/dynamic code and no new storage keys. |
| Performance | Profile worst-case on-screen density (`spawnCreatureNear` swarm) at both flag states; verify distant/off-screen creatures skip the sim; verify node-count caps hold for `apex`/legendary sizes. |

---

### Rollback Plan

- **Feature flag:** `T.PROC_BODY=false` fully disables the new path and restores current rendering (the flag gates both update and draw). Ship dark, enable after verification.
- **Save safety:** the only persisted addition is optional `bodySeed`; absence is handled, so reverting the code leaves saves valid.
- **Revert:** the work is additive (`CreatureBody` module + flag-gated hooks in `Creature.draw`/growth). Revert the PR to remove cleanly; no migrations to undo.

---

### Agents Required

- [x] Research Agent (done — this document)
- [x] Tech Lead Agent (approve the cosmetic-decoupling architecture before coding)
- [ ] Backend Agent (n/a)
- [x] Frontend Agent (all implementation lives in `game.js` Canvas rendering)
- [ ] Security Agent (n/a)
- [ ] DevOps Agent (n/a)
- [x] QA Agent (seed-parity + save-compat + perf verification)
- [ ] Documentation Agent (update `validateCreaturePartVisuals` notes if part model changes)

---

### Notes & Decisions

- **Decision — cosmetic decoupling:** the procedural body never writes back to `x/y/vx/vy/angle/r`. It reads them as its driver. This is what keeps determinism, collision, and save-compat intact while letting the body be as lively/jittery as we want. Treat any temptation to "let physics push the creature" as out of scope.
- **Decision — sub-step inside the body update:** do not touch the main loop's variable-dt model. The body integrator runs a fixed number of sub-steps per frame (e.g. 2–4) sized from `dt` for stability, exactly local to `CreatureBody.update()`.
- **Decision — phased, each phase shippable behind the flag:** P0 lands inert; P1–P4 each add capability; P5 turns it on. Each phase is its own small PR per `AGENTS.md`.
- **Reuse:** copy the node/integration shape from the flora `branches` code (`game.js:2605`+) rather than inventing a new structure — it already fits the codebase style and budget.
- **Open question:** which body kinds map to spine (P1) vs soft-body (P2)? Proposed: `long`→spine, `oval`→spine (short, stiff), `soft`→pressurized loop, `round`→pressurized loop (stiffer). Confirm with Tech Lead.
- **Open question:** persist the CA marking grid, or regenerate from `bodySeed` each load? Recommended: regenerate (cheaper save, deterministic).

---

### Sign-offs

| Agent / Role | Status | Notes |
|---|---|---|
| Tech Lead | Pending | Approve cosmetic-decoupling + body-kind mapping |
| Backend | n/a | |
| Frontend | Pending | |
| Security | n/a | |
| DevOps | n/a | |
| QA | Pending | Seed parity + save compat + perf |
| Documentation | Pending | |
