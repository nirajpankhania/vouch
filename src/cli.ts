#!/usr/bin/env node
// Entry point ONLY: arg parsing, pipeline wiring, exit codes.
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { runPipeline } from './pipeline.js';
import {
  renderAgentNotice,
  renderError,
  renderInit,
  renderListCodes,
  renderReport,
} from './report/terminal.js';
import { loadProjectConfig, resolveConfig } from './config.js';
import { runInit } from './init.js';
import type { DiffMode } from './context/diff.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

/** Exit codes are API (docs/SPEC.md): 0 clean, 1 findings, 2 tool error. */
export const EXIT = {
  clean: 0,
  findings: 1,
  toolError: 2,
} as const;

interface CheckOptions {
  message?: string;
  staged?: boolean;
  base?: string;
  json?: boolean;
  agent: boolean; // commander --no-agent default-true flag
  model?: string;
  debug?: boolean;
}

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
    .option('--debug', 'show full stack traces on errors')
    .action(async (opts: CheckOptions) => {
      try {
        const cwd = process.cwd();
        const cfg = loadProjectConfig(cwd); // throws ConfigError on bad .vouch.json

        // Precedence: CLI flag > .vouch.json > built-in default.
        const baseRef = opts.base ?? cfg.base;
        const mode: DiffMode = opts.staged
          ? { kind: 'staged' }
          : baseRef !== undefined
            ? { kind: 'base', ref: baseRef }
            : { kind: 'working-tree' };
        const model = opts.model ?? cfg.model;
        // --no-agent forces off; otherwise the config default (or on).
        const agent = opts.agent === false ? false : (cfg.agent ?? true);

        const result = await runPipeline({
          mode,
          agent,
          ...(opts.message !== undefined ? { message: opts.message } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(cfg.ignore !== undefined ? { ignore: cfg.ignore } : {}),
          ...(cfg.checks !== undefined ? { checks: cfg.checks } : {}),
        });

        if (opts.json) {
          process.stdout.write(JSON.stringify(result.report, null, 2) + '\n');
        } else {
          process.stdout.write(
            renderReport(result.report, {
              durationMs: result.durationMs,
              model: resolveConfig({ model }).model,
            }),
          );
        }
        // Explain on stderr why the agent didn't run (missing key, error);
        // a successful run shows in the report itself.
        const notice = renderAgentNotice(result.agentStatus, result.agentError);
        if (notice) process.stderr.write(notice);

        process.exitCode =
          result.report.verdict === 'clean' ? EXIT.clean : EXIT.findings;
      } catch (err) {
        process.stderr.write(renderError(err, opts.debug ?? false));
        process.exitCode = EXIT.toolError;
      }
    });

  program
    .command('list-codes')
    .description('List all stable issue codes (both layers) with their meanings')
    .action(() => {
      process.stdout.write(renderListCodes());
      process.exitCode = EXIT.clean;
    });

  program
    .command('init')
    .description('Write a default .vouch.json and gitignore TASK.md')
    .action(() => {
      try {
        process.stdout.write(renderInit(runInit(process.cwd())));
        process.exitCode = EXIT.clean;
      } catch (err) {
        process.stderr.write(renderError(err, false));
        process.exitCode = EXIT.toolError;
      }
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
