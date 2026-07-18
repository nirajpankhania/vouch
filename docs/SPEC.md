# vouch — Specification

> Intent-aware verification for AI-generated code. You tell it what you asked for;
> it tells you what you actually got.

## Problem statement

Code review tools ask "is this good code?" When an agent wrote the diff, the real
question is "is this the code I asked for?" AI-generated diffs fail in characteristic
ways: silent scope creep, deleted/skipped tests, hallucinated imports, stubbed
implementations, unrelated file changes. Nobody carefully reads a 400-line agent diff.
`vouch` is the trust layer between "agent says done" and `git commit`.

## CLI surface (v1 — frozen)

```
vouch check [options]
  -m, --message <task>   The task you gave the agent (highest priority source)
  --staged               Check staged changes (default: working tree vs HEAD)
  --base <ref>           Diff against a ref instead (e.g. main) — for PR branches
  --json                 Machine-readable output (stable schema below)
  --no-agent             Deterministic layer only (no API key needed, fast, free)
  --model <id>           Override default model

vouch init               Writes .vouch.json with defaults + adds TASK.md to .gitignore
```

Exit codes: `0` clean · `1` findings reported · `2` tool error.
These are API — CI users will depend on them.

## Task source resolution (in priority order)

1. `-m` flag
2. `TASK.md` in repo root (gitignored scratch file the user writes their prompt into)
3. **Claude Code transcript** — parse most recent session in
   `~/.claude/projects/<encoded-cwd>/*.jsonl`, extract the latest user task message.
   Best-effort: undocumented format, wrapped in try/catch, version-tolerant parsing
   (look for `role: "user"` text content, ignore unknown fields).
4. Interactive prompt (TTY only): "What did you ask the agent to do?"

If 3 succeeds, echo the extracted task back and ask for confirmation (TTY) or include
it in output (non-TTY) — never silently judge against a wrongly-extracted task.

## Layer 1 — Deterministic checks (zero tokens)

Each check: pure function `(ctx: CheckContext) => Finding[]`.

| Check | Catches | How |
|---|---|---|
| `imports` | Hallucinated APIs | ts-morph: every import added in the diff must resolve to a real module/export |
| `tests` | Quietly weakened safety net | Deleted test files, added `.skip`/`.only`, test bodies emptied (assertion count delta) |
| `placeholders` | Fake completeness | Regex+AST: `// TODO: implement`, `// rest of`, `throw new Error("not implemented")`, empty function bodies added |
| `scope` | Unrelated changes | Files changed that share no path/identifier tokens with the task text (heuristic, low-confidence flag only) |

Findings carry: `check`, `code`, `severity` (error/warn/info), `file`, `line`, `message`, `confidence`.

## Issue codes (API — stable, like exit codes)

Every finding carries a stable kebab-case `code` identifying its category. `check` names
the internal module that produced the finding and may change; `code` may not. Renaming
or removing a code is a breaking change. Codes are what users reference in `.vouch.json`
per-code configuration, and what the terminal report prints as the finding tag.

| Code | Layer | Meaning |
|---|---|---|
| `placeholder-code` | deterministic | Stub markers, "rest of ..." hand-waves, TODO/FIXME, empty bodies added |
| `test-tampering` | deterministic | Test files deleted, `.skip`/`.only` added, assertions gutted |
| `unresolved-import` | deterministic | Added import doesn't resolve: missing file, uninstalled package, invented export (also: import analysis failed, at low confidence) |
| `scope-drift` | deterministic | File shares no tokens with the task — possibly out of scope (heuristic, always info/low) |
| `request-unfulfilled` | agentic | The task asked for something the diff doesn't deliver (missing or incomplete) |
| `unrequested-change` | agentic | Scope creep — a hunk that doesn't follow from the task (derived from `unrequested` classifications) |
| `unintended-removal` | agentic | Existing code or behavior removed when the task didn't call for removal |
| `dead-integration` | agentic | New code isn't wired in — defined but never called, registered, or exported |
| `instruction-file-disobeyed` | agentic | The diff violates a rule in a project instruction file (CLAUDE.md, AGENTS.md, …) |
| `docs-drift` | agentic | The change makes existing docs or comments wrong without updating them |
| `change-narration` | agentic (reserved) | The agent's account of its changes doesn't match the diff — Phase 9, needs a transcript |
| `misleading-claim` | agentic (reserved) | The agent claimed something ("tests pass", "done") the evidence contradicts — Phase 9, needs a transcript |

The agentic taxonomy is deliberately curated and intent-first (8 codes): anything
mechanical enough for a deterministic check lives in `checks/`, and general code-quality
review is out of scope. The two reserved codes are registered now (codes are API) but
only emitted once the Phase 9 conversation-behavior pass exists.

## Layer 2 — Agentic pass (semantics only)

Custom loop, Anthropic SDK, default model `claude-sonnet-4-6` (in config, not hardcoded).

**Job:** classify every hunk against the task:
- `requested` — directly implements the ask
- `supporting` — plausibly necessary (types, imports, config the ask implies)
- `unrequested` — scope creep; explain why it doesn't follow from the task

**Tools available to the agent** (read-only by design — the verifier must never mutate):
- `read_file(path, range?)` — see surrounding context of a hunk
- `read_git_log(path)` — recent history of a file (was this churn normal?)
- `list_dir(path)` — orient in repo structure
- `search(pattern)` — find usages (is this "unused" function actually called?)

Loop budget: max 15 tool calls, then forced verdict. Token cost surfaced in output
(`~$0.0n · n tool calls`) — cost transparency is part of the trust story.

**Output contract:** the model must return JSON (verdict per hunk + issue-coded
findings + overall summary), validated with zod; one retry on parse failure, then
degrade to text summary. The model emits findings only for the emittable codes
(`request-unfulfilled`, `unintended-removal`, `dead-integration`,
`instruction-file-disobeyed`, `docs-drift`); `unrequested-change` findings are
derived by vouch from `unrequested` hunk classifications, never model-emitted.

## JSON output schema (v1)

Versioning policy: additive changes (new fields, e.g. `code` on findings) keep the
version; breaking changes (rename/remove/retype) bump it.

```jsonc
{
  "version": 1,
  "task": { "text": "...", "source": "flag|taskfile|transcript|prompt" },
  "deterministic": [ /* Finding[]: check, code, severity, file, line?, message, confidence */ ],
  "agent": {
    "ran": true,
    "hunks": [ { "file": "...", "range": "...", "classification": "requested|supporting|unrequested", "reason": "..." } ],
    // Same shape as deterministic findings, but check is always "agent",
    // severity always "warn", and file/line are optional (absence codes like
    // request-unfulfilled may have no location). Includes the derived
    // unrequested-change findings. Added in Phase 6 (additive, version stays 1).
    "findings": [ /* check, code, severity, file?, line?, message, confidence */ ],
    "summary": "...",
    "cost": { "inputTokens": 0, "outputTokens": 0, "toolCalls": 0 }
  },
  "verdict": "clean|review|fail"
}
```

## Explicit non-goals (v1)

- No GitHub App / web UI / dashboard
- No language support beyond TS/JS for AST checks (other langs get diff-level checks only)
- No auto-fix — vouch reports, the human decides
- No support for non-Anthropic providers (keeps loop simple; revisit post-v1)

## Roadmap (README material, not v1 work)

- `vouch compare` — judge N parallel agent attempts at the same task, rank them
- `vouch watch` — daemon mode that checks after each Claude Code session ends
- Python AST support

## Dogfooding protocol

From Phase 1 onward, run `vouch check` on every diff Claude Code produces *while
building vouch*. Log real catches in `docs/CAUGHT.md` — this becomes the README's
"what vouch caught while building vouch" section and the strongest credibility signal
in the project.

## Definition of done (v1 ship)

- [ ] `npx vouch check` works on a fresh clone of any TS repo
- [ ] Published to npm as `vouch-cli` (or scoped `@nirajpankhania/vouch` if name taken — check early!)
- [ ] README: problem → 30-second demo GIF → install → how it works diagram → CAUGHT.md highlights → roadmap
- [ ] ≥ 80% test coverage on `checks/` and `context/`
- [ ] CI: lint + test + a self-check (`vouch check --no-agent` on the repo's own last commit)
- [ ] MIT licence
