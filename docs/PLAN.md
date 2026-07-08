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
- [x] `context/transcript.ts`: locate `~/.claude/projects/<encoded-cwd>`, parse newest .jsonl
- [x] Version-tolerant parsing + confirmation UX (echo extracted task back; TTY [Y/n], non-TTY auto-accept + report header)
- [x] Graceful fallback chain proven by tests (missing dir, malformed jsonl, empty session)

## Phase 4 — Agentic layer
- [x] `agent/tools.ts`: read_file, read_git_log, list_dir, search (all read-only)
- [x] `agent/loop.ts`: hand-rolled loop, 15-call budget, zod-validated JSON verdict
- [x] `agent/prompts.ts`: classification prompt with requested/supporting/unrequested rubric
- [x] Cost tracking surfaced in report (~$X (n calls), per-model price table)
- [x] Graceful no-API-key degradation (also: agent error + no-hunks; agent unrequested drives verdict)

## Phase 5 — Polish & ship
- [x] README: problem → demo (real captured output) → install → architecture diagram → CAUGHT.md highlights → roadmap
- [x] `vouch init`, `.vouch.json` config (zod schema) — + ignore globs & per-check toggles
- [x] Error message audit: every failure mode has a human-friendly message (friendly DiffError for not-a-repo / bad --base)
- [ ] Publish to npm, tag v1.0.0, post Show HN / r/ClaudeAI / X thread (handoff prepped — user action)
- [ ] Add to CV + pin on GitHub (user action)

## Phases 6–12 — vet parity + hybrid differentiators

Scoped 2026-07-08 after a source-level read of [imbue-ai/vet](https://github.com/imbue-ai/vet)
(AGPL-3.0, license-compatible once our switch lands; prefer original implementations —
this is also a portfolio piece). Identity: vouch stays an **intent verifier with a deterministic first layer**, not a
general reviewer. The pitch: vouch is hybrid — deterministic gate free and
instant, LLM passes informed by it, native transcript reading, SARIF out.

## Phase 6 — Relicense & taxonomy foundation
- [ ] License switch MIT → AGPL-3.0-only: LICENSE, package.json, README (prior MIT releases stay MIT)
- [ ] Stable issue codes on every `Finding`, both layers. Deterministic: `placeholder-code`,
      `test-tampering`, `unresolved-import`, `scope-drift`. Agentic (curated, intent-first):
      `request-unfulfilled`, `unrequested-change`, `unintended-removal`, `dead-integration`,
      `instruction-file-disobeyed`, `docs-drift`, `change-narration`, `misleading-claim`.
      Codes are API — document in docs/SPEC.md
- [ ] Restructure `agent/prompts.ts` into per-code guide objects (guide/examples/exceptions)
- [ ] `vouch list-codes`
- [ ] `.vouch.json`: per-code enable/disable; per-code guide customization (`prefix`/`suffix`/`replace`)
- [ ] Named profiles in `.vouch.json` + `--profile <name>` (a profile = a bag of defaults)
- [ ] Hybrid wiring: deterministic findings injected into the agent prompt as hints
- [ ] `--checks-only` (alias of `--no-agent`), documented as the zero-cost CI gate

## Phase 7 — Distribution (pulled forward: drives adoption, no dependency on 8–11)
- [ ] `SKILL.md` + install script targeting `.claude/`, `.codex/`, `.opencode/`, `.agents/`
      (project + user level)
- [ ] Composite GitHub Action: merge-base computation, run vouch, post PR review; `--format github`
- [ ] `--format sarif` for GitHub code-scanning upload (neither vet nor vouch has this today)
- [ ] README repositioning around the hybrid pitch

## Phase 8 — Provider abstraction
- [ ] Extract `LLMClient` interface from the loop's existing injected-client seam
- [ ] ONE fetch-based OpenAI-compatible client (covers OpenAI, Ollama, OpenRouter, Gemini) — no new SDK dep
- [ ] `models` section in `.vouch.json`: base_url, api_key_env, context window, pricing; `--model` resolves through it
- [ ] Cost tracking per provider (price table from config, not hardcoded)
- [ ] Amend CLAUDE.md dep + network rules (done in advance, see Hard rules)

## Phase 9 — Multi-pass agent + noise control
- [ ] Parallel passes: intent/scope (existing loop) + conversation-behavior (when transcript available)
- [ ] Confidence on agent findings + `--confidence-threshold` (default in config)
- [ ] Per-finding criteria evaluator: cheap yes/no pass (specific code? introduced by this diff?
      matches the code's definition? not on a removed line?) — kills speculative findings
- [ ] Single dedup-merge LLM call over surviving findings (merge, never drop)
- [ ] `--max-spend` hard dollar cap across all calls in a run

## Phase 10 — Subscription mode
- [ ] `--agentic --harness claude|codex|opencode`: shell out to the installed CLI with a
      guide-embedding prompt, parse the JSON verdict
- [ ] Friendly degradation when the harness binary is missing; document as the no-API-key path

## Phase 11 — More transcript loaders
- [ ] Native Codex, OpenCode, Gemini CLI readers (same best-effort never-throw discipline as Claude Code's)
- [ ] `--history-loader "<command>"` escape hatch + security caveat in README (executes arbitrary shell)

## Phase 12 — Deterministic depth + context scaling
- [ ] `checks/imports`: Python import resolution (Go as stretch) — deterministic multi-language
      import checking as a user-facing check is something vet doesn't have
- [ ] File stubbing via ts-morph (signatures only) for large context
- [ ] Targeted context retrieval for big diffs/repos
- [ ] Prompt-cache the shared context prefix across passes (matters once Phase 9 multiplies calls)

## Session log
<!-- One line per session: date, phase, what shipped, anything vouch caught -->
- 2026-06-12 · Phase 0 · Scaffolded toolchain (TS strict ESM, tsup, vitest, eslint), commander `check` skeleton, CI, npm pack smoke test. Smoke test caught a real bug: main-module guard silently no-ops under `npx .` without `realpathSync` (npm bin shims are junctions). `vouch-cli` confirmed free on npm.
- 2026-06-12 · Phase 1 · Context layer: checks/types.ts contract, context/diff.ts (3 modes, 7 git-generated fixtures, untracked-file synthesis, three-dot --base), context/task.ts (-m → TASK.md → prompt). Fixture-first caught parse-diff's silent chunk-less binary entries. 24 tests.
- 2026-06-12 · Phase 2 · All four checks (placeholders, tests, imports/ts-morph, scope) + report layer + pipeline + CLI wiring. `vouch check --no-agent` works end-to-end (~550ms on the phase-1..2 diff). First dogfood run caught a real vouch bug (no file-type gate → .diff fixtures flagged) → CAUGHT.md #1. 51 tests.
- 2026-06-13 · Phase 3 · context/transcript.ts (best-effort .jsonl reader; skips tool_results/command-wrappers/approvals) wired into task.ts with TTY [Y/n] confirmation + non-TTY auto-accept + transcript task header in report. Inspected the real ~/.claude format first (196 of 231 user entries are tool_results). 66 tests.
- 2026-06-14 · Phase 4 · Agentic layer: config.ts + zod schema, agent/tools.ts (4 read-only, never-throw), prompts.ts (rubric), hand-rolled loop.ts (15-call budget, zod verdict, retry+degrade, cost), wired into pipeline/report/CLI with graceful no-key degradation. Agent unrequested hunks now drive the verdict. Model sonnet-4-6 (revisit). Loop client injected → agent tested with zero network. Dogfood #2: placeholder false-positive on a string literal. 104 tests.
- 2026-06-15 · Phase 5 · Live agent smoke-tested (same diff, honest task → 0/17 unrequested clean; fake task → 17/17 unrequested review — Sonnet nailed both). .vouch.json config + `vouch init` (ignore globs, per-check toggles), friendly DiffError (not-a-repo / bad --base) + BOM tolerance (dogfood), non-blocking CI self-check, README + LICENSE + publish metadata (engines>=20, prepublishOnly). 118 tests. Publish is a user action (handoff prepped).
- 2026-07-08 · Planning · Source-level read of imbue-ai/vet (pipeline: parallel identifiers → confidence filter → per-issue LLM evaluator → dedup-merge; 23 issue codes; models.json; --agentic; --history-loader; skill + Action). Scoped Phases 6–12: curated 8-code intent taxonomy, distribution pulled forward, one fetch-based OpenAI-compatible client, SARIF as a differentiator. Relicensed MIT → AGPL-3.0-only (prior releases stay MIT). CLAUDE.md updated to match.
