# JS → Godot Mapping: Core Loops, Render Paths, and Feature Flags

## Purpose

This document maps Drift’s current JavaScript runtime model to a likely Godot implementation, with emphasis on:

- authoritative gameplay vs cosmetic simulation
- update and draw loop ownership
- feature flags such as `T.PROC_BODY`
- deterministic seeded reconstruction
- phased procedural-creature rollout

It is intended to support future implementation and review work around the procedural-creatures effort defined in `docs/WORK_ORDER_procedural-creatures.md`.

This document should be used together with:

- `README.md`
- `game.js`
- `docs/WORK_ORDER_procedural-creatures.md`

---

## Why this document exists

PR #4 introduces the first scaffolding for feature-flagged procedural creature bodies:

- `T.PROC_BODY` is added as a feature flag
- `CreatureBody` is introduced as a cosmetic module
- each `Creature` owns a `procBody`
- `procBody.update(dt)` runs from `Creature.update(dt)`
- `procBody.draw(...)` is gated inside `Creature.draw(...)`

That scaffolding establishes the architectural rule the Godot port must preserve:

**gameplay remains authoritative in the main creature simulation; procedural body behavior remains cosmetic, deterministic, and safely feature-gated.**

This directly supports the work-order requirement that the procedural body be a cosmetic layer and must not feed back into gameplay state, replay outcomes, collision, AI, or save compatibility.

---

## Current Drift runtime model

Drift currently runs as:

- `home.html` → landing page / local history / replay links
- `index.html` → bootstrap / seed entry
- `game.js` → gameplay runtime, render loop, saves, progression, simulation systems

The main repository README identifies `game.js` as the core gameplay system. In a Godot port, those responsibilities should be split into clearer simulation, rendering, and scene-level ownership.

---

## Core mapping rule

### Rule
**Authoritative gameplay state and cosmetic body state must remain separate.**

### Authoritative gameplay state
These values remain owned by the main creature/gameplay object:

- position
- velocity
- facing / angle
- collision-driving shape assumptions
- AI state
- hunger / health / reproduction timers
- deterministic gameplay-affecting RNG outcomes
- save data required for gameplay continuity

### Cosmetic body state
These values belong to the procedural visual layer:

- spine nodes
- membrane nodes
- spring / Verlet integration state
- appendage chains
- visual wobble, trailing, squash, flex
- skin pattern reconstruction from seed
- other non-authoritative render-only state

### Consequence
The procedural body may read gameplay state, but it must not become the gameplay source of truth.

This rule is required to satisfy the work order’s acceptance criteria around:

- gameplay parity
- seed replay parity
- save compatibility
- safe rollback via feature flag
- performance-oriented fallback behavior

---

## JS → Godot high-level mapping

| Drift JS | Responsibility | Godot mapping |
|---|---|---|
| `home.html` | launcher / history / replay links | main menu scene |
| `index.html` | run bootstrap / seed entry | setup/bootstrap scene |
| `game.js` | world simulation + rendering + save/runtime logic | split across root scene, world controller, entities, and visual nodes |
| `Creature.update(dt)` | authoritative gameplay simulation | creature simulation method called from `_physics_process(delta)` |
| `Creature.draw(...)` | legacy creature render path | visual node render path (`_draw()`, sprite, mesh, or child visual scene) |
| `CreatureBody.update(dt)` | cosmetic body simulation | procedural visual controller updated alongside authoritative sim |
| `CreatureBody.draw(...)` | procedural render path | procedural visual node or draw branch |
| `T.PROC_BODY` | runtime feature flag | project setting, autoload config, or dev/debug toggle |
| `bodySeed` | deterministic per-creature visual seed | persisted `body_seed` field used to reconstruct visual identity |

---

## Loop ownership mapping

### JavaScript today
The work order notes that Drift uses variable `dt`, clamped by `T.DT_MAX`, rather than a global fixed-timestep accumulator. That means body-physics stability work should happen inside the body update, not by redesigning the main game loop.

### Godot recommendation

#### `_physics_process(delta)` should own:
- authoritative gameplay simulation
- creature movement
- AI transitions
- timers affecting gameplay
- deterministic state updates
- procedural body simulation if visual sync and determinism matter

#### `_process(delta)` may own:
- interpolation
- camera smoothing
- purely presentational effects
- optional extra visual polish that does not affect game authority

### Recommended default for Drift
For the procedural creature system, prefer:

- authoritative creature simulation in `_physics_process(delta)`
- procedural body simulation updated from that same step
- procedural rendering through `_draw()` or child visual nodes
- optional interpolation layered on top only for presentation

---

## Feature flag mapping

### JS semantics of `T.PROC_BODY`
PR #4 establishes a specific flag behavior:

- `procBody` is instantiated even when the flag is off
- `procBody.update(dt)` still runs
- `procBody.draw(...)` is only called when `T.PROC_BODY` is true
- legacy rendering remains the visible default while the flag is off

This is a deliberate rollout pattern, not an implementation accident.

### Godot equivalent
Represent this with a clear runtime flag, e.g.:

- `GameFlags.proc_body_enabled`

This may come from:

- an autoload singleton
- a project setting
- a debug menu
- a development-only runtime toggle

### Expected semantics
When disabled:

- legacy visuals remain active
- gameplay remains unchanged
- procedural body state may remain initialized
- procedural simulation may continue if warm-state toggling is desired

When enabled:

- procedural visuals become visible
- gameplay still remains unchanged
- visual rollout remains reversible

This mapping supports the work-order rollback plan and the acceptance criterion that `T.PROC_BODY=false` preserve prior rendering behavior.

---

## Why update may stay on while draw is gated

Running cosmetic update while gating draw is useful because it allows:

- warm-state toggling at runtime
- dark shipping behind a feature flag
- visual enablement without a cold-start pop
- lower rollout risk

Equivalent Godot patterns include:

- always updating a procedural visual controller while toggling visibility
- always maintaining body state while conditionally calling redraw
- switching between legacy and procedural child visuals with a runtime flag

The important point is that the flag controls **presentation**, not gameplay authority.

---

## Creature ownership mapping

### JS direction
A `Creature` now owns:

- authoritative creature data
- growth/morphology metadata
- a deterministic `bodySeed`
- a `procBody` cosmetic attachment

### Recommended Godot split

#### `Creature` / `CreatureController`
Owns:
- position / velocity / angle
- gameplay timers
- template / species identity
- growth level
- save/load fields
- deterministic gameplay-side behavior

#### `CreatureBodyVisual`
Owns:
- generated body structure
- soft-body or spine-node state
- appendage secondary motion
- CA-driven markings or other seeded visuals
- visual LOD/fallback behavior

### Rule
`CreatureBodyVisual` observes `Creature`; it does not replace it.

---

## Draw path mapping

### Current JS rollout
PR #4 does not replace the legacy body immediately. Instead:

- legacy draw remains intact
- procedural draw is additive and gated
- P0 lands as a no-op scaffold

### Godot recommendation
Retain both render paths during rollout:

- `LegacyCreatureVisual`
- `ProceduralCreatureVisual`

Possible structures:

1. child-node split
2. single visual node with dual branches
3. hybrid overlay during transition phases

Recommended choice:
keep both available until the procedural path satisfies the work-order verification and acceptance criteria.

---

## Determinism and seeded reconstruction

The work order requires seed-replay compatibility and limits save-schema expansion to, at most, a `bodySeed`-style field.

### JS intent
PR #4 adds `bodySeed` so a creature can reconstruct the same visual identity deterministically.

### Godot rule
Persist a stable per-creature `body_seed`, and reconstruct cosmetic structure from it.

Do:
- regenerate body layout from seed
- keep the seed stable across saves/reloads
- keep gameplay RNG and cosmetic reconstruction conceptually separate

Do not:
- serialize every procedural node’s transient simulation state unless later proven necessary
- allow cosmetic randomness to alter gameplay outcomes

This mapping supports the work-order acceptance criteria for:
- deterministic visual identity
- old-save compatibility
- replay parity
- minimal save impact

---

## Growth / morphology mapping

The work order defines growth as structural body change rather than simple uniform scale.

### Planned phases
- **P0** scaffolding and decoupling
- **P1** spine chain bodies
- **P2** soft-body pressurized membranes
- **P3** procedural appendages
- **P4** CA-driven structural growth
- **P5** LOD, perf, mouth-anchor, verification

### Godot implication
Growth should map to procedural structure changes such as:

- more spine nodes
- more membrane points
- new appendage anchors
- modified silhouette or stiffness
- regenerated markings or pattern extent

It should not be treated as only:
- sprite scale
- rigid ellipse scale
- collision-only size increase

---

## Mouth-anchor mapping

The work order calls out `getMouthAnchor()` as a required integration point.

### Porting rule
If the procedural body provides a richer head/mouth location, that location may be exposed as an attachment point for presentation and feeding alignment.

However:
- gameplay authority should still remain in the creature/controller
- a deterministic fallback mouth anchor must exist
- loss of the procedural visual path must not break gameplay

In short:
the procedural body may publish an anchor, but it should not become the owner of gameplay motion.

---

## LOD / performance mapping

The work order requires bounded cost and rigid fallback behavior for distant/off-screen creatures.

### Godot mapping
Use:
- distance-based visual LOD
- visibility-driven throttling
- capped node counts
- rigid fallback visual mode
- skipped expensive sim for distant creatures where acceptable

### Rule
Performance optimizations should affect cosmetic fidelity first, not gameplay correctness.

This supports the work-order performance and rollback expectations.

---

## Porting rules

1. **Do not let procedural-body simulation write back into gameplay authority.**
2. **Do not break deterministic replay outcomes.**
3. **Do not require serialization of full transient body-physics state.**
4. **Do preserve legacy rendering until procedural parity is proven.**
5. **Do keep feature-flag rollout reversible.**
6. **Do preserve compatibility with old saves that lack `bodySeed`.**
7. **Do keep body sub-stepping local to the body sim rather than redesigning the entire main loop.**

---

## Acceptance-criteria mapping

This document is intended to reinforce the following work-order outcomes:

| Work-order theme | Mapping implication |
|---|---|
| `T.PROC_BODY=false` preserves legacy behavior | keep legacy render path intact and feature-gate procedural visibility |
| procedural bodies animate under the flag | separate procedural visual system from gameplay core |
| appendages become physically anchored extensions | model appendages as child chains / anchored procedural structures |
| growth changes structure, not just scale | map growth to procedural topology changes |
| seeded markings reconstruct stably | persist `body_seed`, regenerate from seed |
| gameplay parity across flag states | keep gameplay authority outside cosmetic body sim |
| old saves still load | make `body_seed` optional / reconstructable |
| frame-time stays within budget | support visual LOD and rigid fallback |

---

## Recommended Godot terminology

| Drift JS | Suggested Godot name |
|---|---|
| `T.PROC_BODY` | `GameFlags.proc_body_enabled` |
| `Creature` | `Creature` or `CreatureController` |
| `CreatureBody` | `CreatureBodyVisual` |
| `bodySeed` | `body_seed` |
| `update(dt)` | `simulate(delta)` or controller-owned step |
| `draw()` | `_draw()` or visual-node render path |

---

## Summary

The correct Godot mapping for Drift is not a direct translation of JS draw calls into Godot rendering primitives.

The correct mapping is:

- keep authoritative gameplay in the main creature simulation
- keep procedural body behavior in a non-authoritative visual subsystem
- preserve deterministic reconstruction with `bodySeed`
- gate visibility and rollout with a feature flag like `T.PROC_BODY`
- maintain legacy rendering until procedural verification is complete

### One-line rule
**In Drift, gameplay owns truth; procedural body systems own appearance.**