# Build plan

Each phase ends with: tests green, conventional commit, git tag `phase-N`, and an
update to the checkboxes here. One phase ≈ one or two focused Claude Code sessions.

## Phase 0 — Scaffold & skeleton
- [ ] `npm init`, TypeScript strict, ESM, tsup, vitest, eslint config
- [ ] `commander` CLI skeleton: `vouch check --help` works via `npm run dev`
- [ ] `npm pack` + global link test: `npx .` runs the built binary with shebang
- [ ] **Check npm name availability for `vouch-cli` NOW** — rename early if taken
- [ ] CI workflow (GitHub Actions): lint + test on push

## Phase 1 — Context layer (no LLM)
- [ ] `context/diff.ts`: working-tree, `--staged`, `--base <ref>` modes → `Hunk[]`
- [ ] Fixture suite: 6+ real .diff files in tests/fixtures covering renames, deletes, new files, binary
- [ ] `context/task.ts`: `-m` → `TASK.md` → interactive prompt (transcript comes in Phase 3)
- [ ] `checks/types.ts`: `Check`, `Finding`, `CheckContext` interfaces

## Phase 2 — Deterministic checks
- [ ] `checks/placeholders.ts` (easiest, ship first — instant demo value)
- [ ] `checks/tests.ts`
- [ ] `checks/imports.ts` (ts-morph — hardest, budget real time)
- [ ] `checks/scope.ts` (heuristic, mark findings low-confidence)
- [ ] `report/terminal.ts` + `report/json.ts` + exit codes
- [ ] 🚀 **Milestone: `vouch check --no-agent` is genuinely useful. Start dogfooding + CAUGHT.md**

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
