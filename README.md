# vouch

[![npm version](https://img.shields.io/npm/v/vouch-cli)](https://www.npmjs.com/package/vouch-cli)
[![CI](https://github.com/nirajpankhania/vouch/actions/workflows/ci.yml/badge.svg)](https://github.com/nirajpankhania/vouch/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vouch-cli)](./LICENSE)

**Intent-aware verification for AI-generated code.** You tell it what you asked for; it tells you what you actually got.

Code review tools ask "is this good code?" When an agent wrote the diff, the real question is "is this the code I asked for?" `vouch` is the trust layer between "agent says done" and `git commit` — it reads your diff, figures out the task you gave the agent, and tells you whether the change actually does that: catching silent scope creep, deleted tests, hallucinated imports, and stubbed-out implementations.

## Demo

The convincing part: the **same diff** gets opposite verdicts depending on the task you claim it implements. Here's vouch checking its own agentic-layer commit — first against the real task, then against a fabricated one:

```console
$ vouch check --base HEAD~1 -m "wire the agent layer into the pipeline, report, and CLI"
↳ agent: The diff faithfully implements the task: pipeline.ts gains the agent
  orchestration with graceful degradation, the report renders classifications
  and cost, and cli.ts passes options through. Docs and tests are supporting
  artefacts. No unrequested changes detected.
✓ vouch: clean · agent: 0 unrequested of 17 hunks · ~$0.28 (8 calls)

$ vouch check --base HEAD~1 -m "fix a typo in the README"
⚠ unreq src/pipeline.ts [67-112]  Implements maybeRunAgent and threads the agent
        section into the pipeline result; unrelated to fixing a README typo.
⚠ unreq src/report/json.ts [1-24]  Expands AgentSection to the full ran:true
        variant; this is agent schema work, not a README typo fix.
⚠ unreq tests/pipeline.test.ts [1-101]  Adds an integration test suite; unrelated.
  … (14 more)
↳ agent: The task was to fix a typo in the README, but there is no README in this
  repo and every hunk implements the agentic layer. Not one fixes a typo.
vouch: agent: 17 unrequested of 17 hunks · ~$0.16 (6 calls) · verdict: review
```

A keyword linter can't tell those two runs apart. vouch can, because it classifies each change against your *intent* — investigating the code with read-only tools before it decides.

## Install

```bash
npm install -g vouch-cli      # then: vouch check
# or, no install:
npx vouch-cli check
```

Set `ANTHROPIC_API_KEY` to enable the agentic pass. Without it, the deterministic layer still runs (fast, free) and vouch tells you so.

## Usage

```bash
vouch check                       # working tree vs HEAD
vouch check --staged              # staged changes
vouch check --base main           # PR branch vs main (merge-base)
vouch check -m "add retry logic"  # state the task explicitly
vouch check --no-agent            # deterministic checks only — no API key needed
vouch check --json                # machine-readable, stable schema
vouch init                        # write a .vouch.json and gitignore TASK.md
```

**The task** comes from (in priority order): `-m`, a `TASK.md` file in the repo root, your most recent Claude Code session transcript, or an interactive prompt. A task extracted from a transcript is always shown so you can confirm it.

**Exit codes** (stable — script against them in CI): `0` clean · `1` findings · `2` tool error.

## How it works

Two layers. The first is deterministic and runs on every diff for free; the second adds judgment when an API key is present.

```
  your diff ─┐
             ├─▶  Layer 1 · deterministic checks (zero tokens, milliseconds)
  the task ──┤         placeholders · tests · imports (ts-morph) · scope
             │
             └─▶  Layer 2 · agentic pass (Claude, read-only tools)
                       classifies each hunk: requested / supporting / unrequested
                              │
                              ▼
                      report + verdict + exit code
```

- **Layer 1** never calls an LLM. `placeholders` flags stubs and `// TODO: implement`; `tests` flags deleted/`.skip`'d/gutted tests; `imports` uses ts-morph to catch hallucinated modules and missing exports; `scope` flags files that share no tokens with the task (low-confidence only).
- **Layer 2** is a hand-written agent loop (no frameworks) with four read-only tools (`read_file`, `read_git_log`, `list_dir`, `search`), a 15-tool-call budget, and a zod-validated JSON verdict. It judges *intent alignment*, never code quality. The token cost is always shown — a trust tool shows its bill.

## What vouch caught while building vouch

vouch has run on its own diffs since Phase 2. The log lives in [`docs/CAUGHT.md`](./docs/CAUGHT.md); highlights:

- **Its very first run caught a bug in itself** — `placeholders`/`tests` had no file-type gate, so vouch flagged its own committed `.diff` fixtures as stubs. Fixed with an `isCodeFile()` gate.
- **It flags its own test data** — a string literal `'export function helper() {}'` inside a test trips the empty-body check. An honest, documented limitation of regex-over-AST (and why `.vouch.json` has an `ignore` list).

## Configuration

`vouch init` writes a `.vouch.json`:

```json
{
  "agent": true,
  "ignore": ["tests/fixtures/**"],
  "checks": { "placeholders": true, "tests": true, "imports": true, "scope": true }
}
```

`ignore` globs are dropped before both layers; `checks` toggles individual checks; `model` and `base` set defaults. CLI flags always override the file.

## Roadmap

- `vouch compare` — judge N parallel agent attempts at the same task and rank them
- `vouch watch` — daemon mode that checks after each Claude Code session ends
- Python AST support (today, non-TS/JS languages get diff-level checks only)

## Contributing

Issues and PRs welcome. `npm install`, then `npm test` and `npm run lint`. The architecture and the rules that keep it honest are in [`CLAUDE.md`](./CLAUDE.md); every significant decision is logged in [`docs/DECISIONS.md`](./docs/DECISIONS.md).

## License

[AGPL-3.0-only](./LICENSE) © Niraj Pankhania

Versions up to and including v1.0.1 were published under MIT and remain so; the switch to AGPL applies from the next release onward.
