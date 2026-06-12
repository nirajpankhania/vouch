# Build plan

Each phase ends with: tests green, conventional commit, git tag `phase-N`, and an
update to the checkboxes here. One phase ≈ one or two focused Claude Code sessions.

## Phase 0 — Scaffold & skeleton
- [x] `npm init`, TypeScript strict, ESM, tsup, vitest, eslint config
- [x] `commander` CLI skeleton: `vouch check --help` works via `npm run dev`
- [x] `npm pack` + global link test: `npx .` runs the built binary with shebang
- [x] **Check npm name availability for `vouch-cli` NOW** — rename early if taken (free as of 2026-06-12; `vouch` itself is taken)
- [x] CI workflow (GitHub Actions): lint + test on push

## Phase 1 — Context layer (no LLM)
- [x] `context/diff.ts`: working-tree, `--staged`, `--base <ref>` modes → `Hunk[]`
- [x] Fixture suite: 6+ real .diff files in tests/fixtures covering renames, deletes, new files, binary (7 fixtures, git-generated)
- [x] `context/task.ts`: `-m` → `TASK.md` → interactive prompt (transcript comes in Phase 3)
- [x] `checks/types.ts`: `Check`, `Finding`, `CheckContext` interfaces

## Phase 2 — Deterministic checks
- [x] `checks/placeholders.ts` (easiest, ship first — instant demo value)
- [x] `checks/tests.ts`
- [x] `checks/imports.ts` (ts-morph — hardest, budget real time)
- [x] `checks/scope.ts` (heuristic, mark findings low-confidence)
- [x] `report/terminal.ts` + `report/json.ts` + exit codes
- [x] 🚀 **Milestone: `vouch check --no-agent` is genuinely useful. Start dogfooding + CAUGHT.md** (first run caught a vouch bug — CAUGHT.md #1)

## Phase 3 — Task extraction from Claude Code
- [ ] `context/transcript.ts`: locate `~/.claude/projects/<encoded-cwd>`, parse newest .jsonl
- [ ] Version-tolerant parsing + confirmation UX (echo extracted task back)
- [ ] Graceful fallback chain proven by tests (missing dir, malformed jsonl, empty session)

## Phase 4 — Agentic layer
- [ ] `agent/tools.ts`: read_file, read_git_log, list_dir, search (all read-only)
- [ ] `agent/loop.ts`: hand-rolled loop, 15-call budget, zod-validated JSON verdict
- [ ] `agent/prompts.ts`: classification prompt with requested/supporting/unrequested rubric
- [ ] Cost tracking surfaced in report
- [ ] Graceful no-API-key degradation

## Phase 5 — Polish & ship
- [ ] README: problem → demo GIF (asciinema/vhs) → install → architecture diagram → CAUGHT.md highlights → roadmap
- [ ] `vouch init`, `.vouch.json` config (zod schema)
- [ ] Error message audit: every failure mode has a human-friendly message
- [ ] Publish to npm, tag v1.0.0, post Show HN / r/ClaudeAI / X thread
- [ ] Add to CV + pin on GitHub

## Session log
<!-- One line per session: date, phase, what shipped, anything vouch caught -->
- 2026-06-12 · Phase 0 · Scaffolded toolchain (TS strict ESM, tsup, vitest, eslint), commander `check` skeleton, CI, npm pack smoke test. Smoke test caught a real bug: main-module guard silently no-ops under `npx .` without `realpathSync` (npm bin shims are junctions). `vouch-cli` confirmed free on npm.
- 2026-06-12 · Phase 1 · Context layer: checks/types.ts contract, context/diff.ts (3 modes, 7 git-generated fixtures, untracked-file synthesis, three-dot --base), context/task.ts (-m → TASK.md → prompt). Fixture-first caught parse-diff's silent chunk-less binary entries. 24 tests.
- 2026-06-12 · Phase 2 · All four checks (placeholders, tests, imports/ts-morph, scope) + report layer + pipeline + CLI wiring. `vouch check --no-agent` works end-to-end (~550ms on the phase-1..2 diff). First dogfood run caught a real vouch bug (no file-type gate → .diff fixtures flagged) → CAUGHT.md #1. 51 tests.
