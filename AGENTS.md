# AGENTS.md

Lightweight instructions for contributors and coding agents working in **Drift**.

## Project identity (preserve)

Drift is a procedural micro-ecosystem survival game with:
- replayable seeded runs
- mutations, biomes, creatures, and progression systems
- locally saved run history and scoreboard

Do not remove or rewrite these core systems when making routine improvements.

## Runtime entry points

- `home.html` → landing page + local scoreboard
- `index.html` → game shell/HUD/menus
- `game.js` → main game logic and systems

Navigation flow:
- `home.html` links to `index.html`
- replay links pass `?seed=...` into `index.html`

## Data compatibility rules

- Preserve local save key compatibility: `drift.micro-eco.v1`
- Keep save shape backward-compatible unless migration is explicitly implemented
- Do not break replay determinism for seeded runs

## Development guardrails

- Prefer plain HTML/CSS/JavaScript and static hosting compatibility
- Make small, reviewable changes
- Avoid introducing frameworks/build systems unless explicitly requested
- Keep gameplay behavior unchanged unless the task explicitly targets gameplay balance/features
- Add comments only where logic is complex and clarity is needed

## Standard work loop

1. Research relevant files and architecture before edits
2. Plan concise file-scoped changes
3. Implement focused updates only
4. Verify with available checks (or syntax/static checks if no test suite exists)
5. Report changed files, verification results, and any risks/follow-ups

## Minimum verification checklist

When no formal tests/build exist, run at least:
- JavaScript syntax check for `game.js`
- static sanity checks that `home.html` and `index.html` still load expected script/entry structure
- spot-check seed and save-related paths if touched
