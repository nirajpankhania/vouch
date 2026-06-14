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

## #2 — 2026-06-14 · false positive: placeholder match inside a string literal

Dogfooding the Phase 4 diff, `placeholders` flagged
`tests/agent/tools.test.ts:22` — the line writes a *fixture file* whose content
is the string `'export function helper() {}\n'`. The empty-function-body regex
matched code that only exists as test data inside a string literal. This is the
known precision tradeoff of regex-over-added-lines (logged in DECISIONS): the
check can't tell code from a string containing code. Left as-is for v1 — adding
string-literal awareness needs the AST we deliberately avoided here, and the
`.vouch.json` ignore list (Phase 5) is the cheaper escape hatch. Honest signal:
vouch flags its own test data, so the limitation is real and documented.
