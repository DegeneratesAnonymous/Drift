# Drift

Drift is a static HTML/JavaScript procedural micro-ecosystem survival game.
Each run is seedable and replayable, progression is survival-driven, and run history is saved locally in the browser.

## Runtime architecture

- `home.html` — landing page, local scoreboard, and replay links.
- `index.html` — game entry page (start flow + seed input/bootstrap).
- `game.js` — core gameplay systems (procedural world, survival loop, mutations, biomes, creature templates, saves).

Launch flow:
`home.html` → `index.html` → `game.js`

## Run locally

No build step is required.

Option A (quick): open `home.html` directly in a browser.  
Option B (recommended): serve the repo as static files with any simple static server, then open `home.html`.

## Saves and replay seeds

- Drift stores local progress in `localStorage` under key `drift.micro-eco.v1`.
- The home scoreboard reads that save data and shows recent runs.
- Replay links use `index.html?seed=...` to relaunch a specific run seed.

When editing save/replay code, preserve backward compatibility unless a migration is explicitly implemented.

## Contributor and agent guidance

- Drift-specific change guardrails: [`AGENTS.md`](AGENTS.md)
- Lightweight manual verification checklist: [`docs/VERIFYING.md`](docs/VERIFYING.md)

## Workflow/process references

The repository also includes AI workflow scaffolding:

- [`docs/DEV_WORKFLOW.md`](docs/DEV_WORKFLOW.md)
- [`.github/workflows/agent-workflow.yml`](.github/workflows/agent-workflow.yml)
- [`.github/workflows/qa-retry.yml`](.github/workflows/qa-retry.yml)
- [`.github/pull_request_template.md`](.github/pull_request_template.md)

## License

[MIT](LICENSE)
