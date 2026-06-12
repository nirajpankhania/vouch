# What vouch caught (while building vouch)

Dogfooding log, newest first. Each entry: what vouch reported, whether it was
right, and what changed because of it.

## #1 — 2026-06-12 · vouch's first run caught a bug in vouch

First-ever pipeline run (`vouch check --no-agent --base phase-1` on vouch's own
Phase 2 diff) reported 20 findings — and the interesting ones were false
positives revealing a real design gap: `placeholders` and `tests` had **no
file-type gate**, so committed `.diff` fixtures and prose were scanned as if
they were code (`tests/fixtures/placeholders/stub-added.diff:8 — explicit
"not implemented" marker`). A `.diff` fixture under `tests/` even satisfied the
tests check's path convention. Fix: `checks/shared.ts` `isCodeFile()` gate +
regression fixture `prose-and-fixtures.diff`. The `imports` errors on
`tests/fixtures/imports/project/*.ts` were *correct* (those files are broken by
design) — motivates the `.vouch.json` ignore list planned for Phase 5.
