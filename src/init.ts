// `vouch init`: write a default .vouch.json and ensure TASK.md is gitignored
// (docs/SPEC.md). Idempotent — never clobbers an existing config.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultVouchJson } from './config.js';

export interface InitResult {
  configCreated: boolean; // false if .vouch.json already existed
  gitignoreUpdated: boolean; // true if we added TASK.md to .gitignore
}

export function runInit(cwd: string = process.cwd()): InitResult {
  const configPath = path.join(cwd, '.vouch.json');
  const configCreated = !existsSync(configPath);
  if (configCreated) {
    writeFileSync(configPath, defaultVouchJson());
  }
  return {
    configCreated,
    gitignoreUpdated: ensureGitignored(cwd, 'TASK.md'),
  };
}

/** Append `entry` to .gitignore if not already present. Returns whether added. */
function ensureGitignored(cwd: string, entry: string): boolean {
  const gitignorePath = path.join(cwd, '.gitignore');
  let current: string;
  try {
    current = readFileSync(gitignorePath, 'utf8');
  } catch {
    current = ''; // no .gitignore yet — we'll create one
  }
  const lines = current.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(entry)) return false;

  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  writeFileSync(gitignorePath, `${current}${prefix}${entry}\n`);
  return true;
}
