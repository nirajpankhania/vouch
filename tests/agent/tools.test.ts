import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeTool, toolDefs, type AgentToolContext } from '../../src/agent/tools.js';

describe('agent tools', () => {
  let cwd: string;
  let ctx: AgentToolContext;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'vouch-tools-'));
    ctx = { cwd };
    const git = simpleGit(cwd);
    await git.raw(['init', '-b', 'main']);
    await git.addConfig('user.email', 'test@vouch.test');
    await git.addConfig('user.name', 'test');
    await git.addConfig('core.autocrlf', 'false');
    writeFileSync(path.join(cwd, 'app.ts'), 'export const A = 1;\nexport const B = 2;\nexport const C = 3;\n');
    mkdirSync(path.join(cwd, 'src'));
    writeFileSync(path.join(cwd, 'src', 'util.ts'), 'export function helper() {}\n');
    await git.add('.');
    await git.commit('initial');
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('exposes the four read-only tools', () => {
    expect(toolDefs.map((t) => t.name)).toEqual(['read_file', 'read_git_log', 'list_dir', 'search']);
  });

  it('read_file returns numbered lines', async () => {
    const out = await executeTool('read_file', { path: 'app.ts' }, ctx);
    expect(out).toBe('1\texport const A = 1;\n2\texport const B = 2;\n3\texport const C = 3;\n4\t');
  });

  it('read_file honours a line range', async () => {
    const out = await executeTool('read_file', { path: 'app.ts', start_line: 2, end_line: 2 }, ctx);
    expect(out).toBe('2\texport const B = 2;');
  });

  it('read_file on a missing file returns an ERROR string, never throws', async () => {
    const out = await executeTool('read_file', { path: 'nope.ts' }, ctx);
    expect(out).toMatch(/^ERROR:/);
  });

  it('rejects paths that escape the repo root', async () => {
    const out = await executeTool('read_file', { path: '../../etc/passwd' }, ctx);
    expect(out).toBe('ERROR: path escapes repository root: ../../etc/passwd');
  });

  it('list_dir marks directories with a trailing slash', async () => {
    const out = await executeTool('list_dir', {}, ctx);
    const entries = out.split('\n');
    expect(entries).toContain('app.ts');
    expect(entries).toContain('src/');
  });

  it('read_git_log returns commit subjects', async () => {
    const out = await executeTool('read_git_log', { path: 'app.ts' }, ctx);
    expect(out).toContain('initial');
  });

  it('search finds matches and reports none cleanly', async () => {
    const hit = await executeTool('search', { pattern: 'helper' }, ctx);
    expect(hit).toContain('src/util.ts');
    const miss = await executeTool('search', { pattern: 'zzz_nonexistent_zzz' }, ctx);
    expect(miss).toBe('(no matches for: zzz_nonexistent_zzz)');
  });

  it('invalid input returns an ERROR string, never throws', async () => {
    const out = await executeTool('read_file', { notpath: true }, ctx);
    expect(out).toMatch(/^ERROR: invalid input for read_file/);
  });

  it('unknown tool name returns an ERROR string', async () => {
    const out = await executeTool('delete_everything', {}, ctx);
    expect(out).toBe('ERROR: unknown tool: delete_everything');
  });
});
