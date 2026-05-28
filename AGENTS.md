# Drift Agent Instructions

This repository is **Drift**, a static HTML/JavaScript procedural micro-ecosystem survival game.

## Runtime launch flow

1. `home.html` - landing page and local scoreboard.
2. `index.html` - main game entry page and seed bootstrapping.
3. `game.js` - core procedural gameplay systems and run/save logic.

## Core safety rules (required)

- Keep Drift’s identity intact: procedural ecosystem gameplay, survival progression, mutations, biomes, and creature templates.
- Preserve local save compatibility with `localStorage` key **`drift.micro-eco.v1`**.
- Preserve replay behavior via **`index.html?seed=...`** links and URL-seed bootstrapping.
- Keep the game static-hostable and offline-friendly (no required backend/build/network step for runtime).
- Do not assume a framework or build system exists.
- Prefer small, reviewable changes; avoid broad rewrites of the single-file gameplay architecture in `game.js`.

## Files to inspect before editing

Paths below are relative to the repository root.

- `home.html`
- `index.html`
- `game.js`
- `README.md`
- `docs/VERIFYING.md`
- `docs/DEV_WORKFLOW.md`
- `.github/workflows/agent-workflow.yml`
- `.github/workflows/qa-retry.yml`
- `.github/ISSUE_TEMPLATE/`

## Required change workflow

1. **Research**: inspect structure, launch files, and affected systems.
2. **Plan**: write a short implementation plan before editing.
3. **Implement**: make the smallest safe set of edits.
4. **Verify**: run the lightweight checks in `docs/VERIFYING.md`.
5. **Report**: include changed files, verification performed, and any risks/follow-up.

## Verification minimums

After changes, confirm at least:

- `home.html` still loads and scoreboard logic still runs.
- `index.html` still loads and launches `game.js`.
- `game.js` has no syntax errors.
- Replay links still route through `index.html?seed=...`.
- Save/replay logic remains backward-compatible if touched.
- No new required build/server/network dependency was introduced.
