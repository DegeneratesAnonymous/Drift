# Drift Lightweight Verification Checklist

Use this checklist after any change, especially if it touches launch, save, or replay flow.

## Minimum checks

1. Open `home.html` and confirm the page renders without obvious console/runtime errors.
2. Open `index.html` and confirm the intro/start UI renders and `game.js` loads.
3. Confirm `home.html` still links to `index.html`.
4. Confirm replay links still target `index.html?seed=...`.
5. Confirm scoreboard data is still read from localStorage key `drift.micro-eco.v1`.
6. Confirm touched JavaScript files have no syntax errors (for example: `node --check game.js` if Node is available, otherwise check browser console for parse/runtime errors on load).
7. Confirm no required build/package-install/server step was introduced for normal play.

## If save/replay logic was touched

1. Verify an existing save still appears on the home scoreboard.
2. Verify replaying an existing seed still launches the expected seeded run.
3. Verify save structure changes (if any) are backward-compatible or explicitly migrated.
