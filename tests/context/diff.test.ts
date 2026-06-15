import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiffError, getHunks, parseDiffToHunks } from '../../src/context/diff.js';
import type { Hunk } from '../../src/checks/types.js';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/diff/${name}`, import.meta.url), 'utf8');
}

describe('parseDiffToHunks (fixtures are real git output)', () => {
  it('modify: one hunk with context/del/add lines', () => {
    const hunks = parseDiffToHunks(fixture('modify.diff'));
    expect(hunks).toEqual<Hunk[]>([
      {
        file: 'greet.ts',
        oldFile: null,
        status: 'modified',
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [
          { kind: 'context', text: 'export function greet(name: string): string {', oldLine: 1, newLine: 1 },
          { kind: 'del', text: '  return `Hello, ${name}!`;', oldLine: 2 },
          { kind: 'add', text: '  return `Hi, ${name}!`;', newLine: 2 },
          { kind: 'context', text: '}', oldLine: 3, newLine: 3 },
        ],
      },
    ]);
  });

  it('new file: status added, all add lines, old range 0', () => {
    const hunks = parseDiffToHunks(fixture('new-file.diff'));
    expect(hunks).toEqual<Hunk[]>([
      {
        file: 'added.ts',
        oldFile: null,
        status: 'added',
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 3,
        lines: [
          { kind: 'add', text: 'export function shiny(): string {', newLine: 1 },
          { kind: 'add', text: "  return 'new';", newLine: 2 },
          { kind: 'add', text: '}', newLine: 3 },
        ],
      },
    ]);
  });

  it('delete: status deleted, file is the deleted path, all del lines', () => {
    const hunks = parseDiffToHunks(fixture('delete.diff'));
    expect(hunks).toEqual<Hunk[]>([
      {
        file: 'util.ts',
        oldFile: null,
        status: 'deleted',
        oldStart: 1,
        oldLines: 3,
        newStart: 0,
        newLines: 0,
        lines: [
          { kind: 'del', text: 'export function clamp(n: number, lo: number, hi: number): number {', oldLine: 1 },
          { kind: 'del', text: '  return Math.min(hi, Math.max(lo, n));', oldLine: 2 },
          { kind: 'del', text: '}', oldLine: 3 },
        ],
      },
    ]);
  });

  it('rename with edit: status renamed, oldFile carries the previous path', () => {
    const hunks = parseDiffToHunks(fixture('rename.diff'));
    expect(hunks).toHaveLength(1);
    const h = hunks[0]!;
    expect(h.file).toBe('new-name.ts');
    expect(h.oldFile).toBe('old-name.ts');
    expect(h.status).toBe('renamed');
    expect(h.lines.filter((l) => l.kind === 'del')).toEqual([
      { kind: 'del', text: "export const QUESTION = 'unknown';", oldLine: 2 },
    ]);
    expect(h.lines.filter((l) => l.kind === 'add')).toEqual([
      { kind: 'add', text: "export const QUESTION = 'tbd';", newLine: 2 },
    ]);
  });

  it('binary: single hunk, status binary, no lines', () => {
    const hunks = parseDiffToHunks(fixture('binary.diff'));
    expect(hunks).toEqual<Hunk[]>([
      {
        file: 'data.bin',
        oldFile: null,
        status: 'binary',
        oldStart: 0,
        oldLines: 0,
        newStart: 0,
        newLines: 0,
        lines: [],
      },
    ]);
  });

  it('multi-hunk: two hunks for the same file, correct line numbering', () => {
    const hunks = parseDiffToHunks(fixture('multi-hunk.diff'));
    expect(hunks).toHaveLength(2);
    expect(hunks.map((h) => h.file)).toEqual(['tall.ts', 'tall.ts']);
    expect(hunks.map((h) => h.status)).toEqual(['modified', 'modified']);
    expect(hunks[0]).toMatchObject({ oldStart: 1, oldLines: 5, newStart: 1, newLines: 5 });
    expect(hunks[1]).toMatchObject({ oldStart: 11, oldLines: 5, newStart: 11, newLines: 5 });
    expect(hunks[1]!.lines.find((l) => l.kind === 'add')).toEqual({
      kind: 'add',
      text: '// line 14 EDITED',
      newLine: 14,
    });
  });

  it('mixed: added + modified + deleted files in one diff, in order', () => {
    const hunks = parseDiffToHunks(fixture('mixed.diff'));
    expect(hunks.map((h) => [h.file, h.status])).toEqual([
      ['extra.ts', 'added'],
      ['greet.ts', 'modified'],
      ['util.ts', 'deleted'],
    ]);
  });

  it('empty diff text yields no hunks', () => {
    expect(parseDiffToHunks('')).toEqual([]);
  });
});

describe('getHunks acquisition modes (integration, temp repo)', () => {
  let repo: string;

  beforeEach(async () => {
    repo = mkdtempSync(path.join(tmpdir(), 'vouch-diff-'));
    const git = simpleGit(repo);
    await git.raw(['init', '-b', 'main']);
    await git.addConfig('user.email', 'test@vouch.test');
    await git.addConfig('user.name', 'test');
    await git.addConfig('core.autocrlf', 'false');
    writeFileSync(path.join(repo, 'a.ts'), 'export const A = 1;\n');
    mkdirSync(path.join(repo, 'sub'));
    writeFileSync(path.join(repo, 'sub', 'b.ts'), 'export const B = 2;\n');
    await git.add('.');
    await git.commit('base');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('working-tree: unstaged modifications vs HEAD', async () => {
    writeFileSync(path.join(repo, 'a.ts'), 'export const A = 99;\n');
    const hunks = await getHunks({ kind: 'working-tree' }, repo);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ file: 'a.ts', status: 'modified' });
  });

  it('working-tree: untracked new files appear as added hunks (git diff HEAD alone misses these)', async () => {
    writeFileSync(path.join(repo, 'sub', 'fresh.ts'), 'export const F = 3;\nexport const G = 4;\n');
    const hunks = await getHunks({ kind: 'working-tree' }, repo);
    expect(hunks).toEqual<Hunk[]>([
      {
        file: 'sub/fresh.ts',
        oldFile: null,
        status: 'added',
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 2,
        lines: [
          { kind: 'add', text: 'export const F = 3;', newLine: 1 },
          { kind: 'add', text: 'export const G = 4;', newLine: 2 },
        ],
      },
    ]);
  });

  it('staged: only the staged change is reported', async () => {
    writeFileSync(path.join(repo, 'a.ts'), 'export const A = 7;\n');
    const git = simpleGit(repo);
    await git.add('a.ts');
    writeFileSync(path.join(repo, 'sub', 'b.ts'), 'export const B = 8;\n'); // unstaged
    const hunks = await getHunks({ kind: 'staged' }, repo);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ file: 'a.ts', status: 'modified' });
  });

  it('base: diffs committed work against merge-base (three-dot), ignoring base-side drift', async () => {
    const git = simpleGit(repo);
    await git.checkoutLocalBranch('feature');
    writeFileSync(path.join(repo, 'sub', 'b.ts'), 'export const B = 42;\n');
    await git.add('.');
    await git.commit('feature work');
    // drift on main AFTER branching — must not show up in the feature diff
    await git.checkout('main');
    writeFileSync(path.join(repo, 'a.ts'), 'export const A = 1000;\n');
    await git.add('.');
    await git.commit('main drift');
    await git.checkout('feature');
    const hunks = await getHunks({ kind: 'base', ref: 'main' }, repo);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ file: 'sub/b.ts', status: 'modified' });
  });

  it('an invalid --base ref throws a friendly DiffError naming the ref', async () => {
    await expect(getHunks({ kind: 'base', ref: 'no-such-ref' }, repo)).rejects.toThrow(
      /no-such-ref.*valid branch or commit/,
    );
  });
});

describe('getHunks outside a git repo', () => {
  let notARepo: string;
  beforeEach(() => {
    notARepo = mkdtempSync(path.join(tmpdir(), 'vouch-norepo-'));
  });
  afterEach(() => {
    rmSync(notARepo, { recursive: true, force: true });
  });

  it('throws a friendly DiffError', async () => {
    await expect(getHunks({ kind: 'working-tree' }, notARepo)).rejects.toThrow(DiffError);
    await expect(getHunks({ kind: 'working-tree' }, notARepo)).rejects.toThrow(
      /not a git repository/,
    );
  });
});
