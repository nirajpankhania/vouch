# Decisions

One line per significant technical decision: "choice over alternative: reason".

- `vouch-cli` package name over `vouch`: `vouch` is taken on npm (v0.2.0); `vouch-cli` was free (checked 2026-06-12). Bin name stays `vouch`.
- tsup emits dist, tsc is typecheck-only (`noEmit`) over tsc-as-compiler: one tool owns the artifact (shebang + executable bit), tsc stays the strictness gate in `npm run lint`.
- `buildProgram()` export + run-when-main guard over parse-on-import in cli.ts: lets vitest import the CLI without executing it, keeping cli.ts the only entry point.
- `realpathSync(argv[1])` in the main-module guard over bare `import.meta.url === pathToFileURL(argv[1])`: npm/npx bin shims invoke via symlink/junction paths, so the bare comparison silently no-ops under `npx .` (found by Phase 0 smoke test).
- Own `Hunk` type in checks/types.ts over re-exporting parse-diff's types: checks stay decoupled from the diff library so it can be swapped without touching `checks/`.
- `ProjectAccess` ships Phase 1 with pre-read file contents only over adding ts-morph now: the heavy dep lands in Phase 2 when `checks/imports.ts` actually needs it; the contract grows a field, callers don't change.
- Hunk paths stay git-normalized (`/`) over converting to platform separators: checks compare against diff data; `context/` converts only at the filesystem-read boundary.
