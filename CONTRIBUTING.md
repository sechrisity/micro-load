# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Ground rules

- Keep it small. Rep Ledger is plain HTML, CSS and JavaScript with no build step, and a single-file FastAPI server. New dependencies need a strong reason.
- Keep it private. No analytics, tracking, external fonts or CDNs.
- Keep it safe. Training suggestions stay conservative and are always overridable. Do not add features that present the app as medical or coaching advice.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make your change. Pure training logic belongs in `static/js/logic.js` with a test in `tests/logic.test.js`.
3. Run the checks:

   ```bash
   pip install -r requirements-dev.txt
   pytest -q
   node --test tests/*.test.js
   docker build -t rep-ledger:dev .
   ```

4. If you changed any app shell file, bump the cache name in `static/sw.js`.
5. Add a line under `Unreleased` in `CHANGELOG.md`.
6. Open a pull request that says what changed and why.

## Adding exercises

Add a row to `ROWS` in `static/js/exercises.js`: name, muscle group, region, equipment, measure and movement pattern. The id is derived from the name, so names must be unique. The logic tests check every row for valid fields.

## Reporting bugs

Include the browser and device, whether you run it with the server or as static files, and steps to reproduce. Do not attach your `state.json` or backups: they contain personal training and health data.
