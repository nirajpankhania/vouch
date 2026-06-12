# Decisions

One line per significant technical decision: "choice over alternative: reason".

- `vouch-cli` package name over `vouch`: `vouch` is taken on npm (v0.2.0); `vouch-cli` was free (checked 2026-06-12). Bin name stays `vouch`.
- tsup emits dist, tsc is typecheck-only (`noEmit`) over tsc-as-compiler: one tool owns the artifact (shebang + executable bit), tsc stays the strictness gate in `npm run lint`.
- `buildProgram()` export + run-when-main guard over parse-on-import in cli.ts: lets vitest import the CLI without executing it, keeping cli.ts the only entry point.
- `realpathSync(argv[1])` in the main-module guard over bare `import.meta.url === pathToFileURL(argv[1])`: npm/npx bin shims invoke via symlink/junction paths, so the bare comparison silently no-ops under `npx .` (found by Phase 0 smoke test).
