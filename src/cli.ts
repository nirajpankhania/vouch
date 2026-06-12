#!/usr/bin/env node
// Entry point ONLY: arg parsing, pipeline wiring, exit codes.
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

/** Exit codes are API (docs/SPEC.md): 0 clean, 1 findings, 2 tool error. */
export const EXIT = {
  clean: 0,
  findings: 1,
  toolError: 2,
} as const;

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('vouch')
    .description(
      'Intent-aware verification for AI-generated code.\n' +
        'You tell it what you asked for; it tells you what you actually got.',
    )
    .version(pkg.version);

  program
    .command('check')
    .description('Check the current diff against the task you gave the agent')
    .option('-m, --message <task>', 'the task you gave the agent (highest priority source)')
    .option('--staged', 'check staged changes (default: working tree vs HEAD)')
    .option('--base <ref>', 'diff against a ref instead (e.g. main) — for PR branches')
    .option('--json', 'machine-readable output')
    .option('--no-agent', 'deterministic layer only (no API key needed, fast, free)')
    .option('--model <id>', 'override default model')
    .action(() => {
      // Pipeline lands in Phase 1+. Until then this is an honest tool error,
      // not a fake "clean".
      console.error('vouch check is not implemented yet (Phase 0 skeleton).');
      process.exitCode = EXIT.toolError;
    });

  return program;
}

// Run only when invoked as a script (node dist/cli.js / npx vouch), not when
// imported by tests. npm bin shims point at a symlink/junction (e.g. the npx
// cache), while import.meta.url is the resolved real path — so realpath
// argv[1] before comparing.
function isMainModule(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(invoked)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  buildProgram().parse();
}
