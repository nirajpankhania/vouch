import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectConfigSchema } from '../src/config.js';
import { runInit } from '../src/init.js';

describe('runInit', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'vouch-init-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates a valid .vouch.json and gitignores TASK.md', () => {
    const result = runInit(cwd);
    expect(result).toEqual({ configCreated: true, gitignoreUpdated: true });
    const cfg = JSON.parse(readFileSync(path.join(cwd, '.vouch.json'), 'utf8'));
    expect(projectConfigSchema.safeParse(cfg).success).toBe(true);
    expect(readFileSync(path.join(cwd, '.gitignore'), 'utf8')).toContain('TASK.md');
  });

  it('is idempotent — does not clobber an existing config or duplicate gitignore entries', () => {
    writeFileSync(path.join(cwd, '.vouch.json'), '{"agent":false}');
    writeFileSync(path.join(cwd, '.gitignore'), 'node_modules/\nTASK.md\n');
    const result = runInit(cwd);
    expect(result).toEqual({ configCreated: false, gitignoreUpdated: false });
    expect(readFileSync(path.join(cwd, '.vouch.json'), 'utf8')).toBe('{"agent":false}');
    const gitignore = readFileSync(path.join(cwd, '.gitignore'), 'utf8');
    expect(gitignore.match(/TASK\.md/g)).toHaveLength(1);
  });

  it('appends TASK.md to an existing .gitignore that lacks a trailing newline', () => {
    writeFileSync(path.join(cwd, '.gitignore'), 'dist/');
    runInit(cwd);
    expect(readFileSync(path.join(cwd, '.gitignore'), 'utf8')).toBe('dist/\nTASK.md\n');
  });
});
