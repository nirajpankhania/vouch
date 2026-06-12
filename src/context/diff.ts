// Diff acquisition + parsing. ALL git/filesystem I/O for the diff lives here;
// checks receive the result via CheckContext and never touch git themselves.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import parseDiff from 'parse-diff';
import { simpleGit } from 'simple-git';
import type { FileStatus, Hunk, HunkLine } from '../checks/types.js';

export type DiffMode =
  | { kind: 'working-tree' } // default: working tree vs HEAD
  | { kind: 'staged' } // --staged
  | { kind: 'base'; ref: string }; // --base <ref>

/** Raw unified diff text for the requested mode. */
export async function acquireDiff(mode: DiffMode, cwd: string = process.cwd()): Promise<string> {
  const git = simpleGit(cwd);
  switch (mode.kind) {
    case 'working-tree':
      return git.diff(['HEAD']);
    case 'staged':
      return git.diff(['--cached']);
    case 'base':
      // Three-dot (merge-base) semantics — what a PR shows. A two-dot diff
      // would blame the branch for unrelated drift on the base.
      return git.diff([`${mode.ref}...HEAD`]);
  }
}

/**
 * Parse unified diff text into Hunk[]. Pure — exported separately from
 * acquisition so it can be tested against fixture files.
 * Paths in the result are git-normalized ('/').
 */
export function parseDiffToHunks(diffText: string): Hunk[] {
  const hunks: Hunk[] = [];
  const binaries = binaryPaths(diffText);
  for (const file of parseDiff(diffText)) {
    const status = fileStatus(file);
    const filePath = status === 'deleted' ? (file.from ?? '') : (file.to ?? '');
    const oldFile = status === 'renamed' ? (file.from ?? null) : null;

    if (file.chunks.length === 0) {
      // No textual hunks: binary change (or mode-only change — also worth
      // surfacing, and indistinguishable cheaply; both carry no lines).
      hunks.push({
        file: filePath,
        oldFile,
        status: binaries.has(filePath) ? 'binary' : status,
        oldStart: 0,
        oldLines: 0,
        newStart: 0,
        newLines: 0,
        lines: [],
      });
      continue;
    }

    for (const chunk of file.chunks) {
      hunks.push({
        file: filePath,
        oldFile,
        status,
        oldStart: chunk.oldStart,
        oldLines: chunk.oldLines,
        newStart: chunk.newStart,
        newLines: chunk.newLines,
        lines: chunk.changes.flatMap(toHunkLine),
      });
    }
  }
  return hunks;
}

/**
 * Hunks for the requested mode. In working-tree mode, untracked files are
 * synthesized as 'added' hunks — `git diff HEAD` can't see them, but a
 * just-written agent file is exactly what vouch exists to inspect.
 */
export async function getHunks(mode: DiffMode, cwd: string = process.cwd()): Promise<Hunk[]> {
  const hunks = parseDiffToHunks(await acquireDiff(mode, cwd));
  if (mode.kind === 'working-tree') {
    hunks.push(...(await untrackedHunks(cwd)));
  }
  return hunks;
}

function fileStatus(file: parseDiff.File): FileStatus {
  if (file.new) return 'added';
  if (file.deleted) return 'deleted';
  if (file.from && file.to && file.from !== file.to) return 'renamed';
  return 'modified';
}

/**
 * parse-diff emits binary changes as chunk-less file entries with no flag,
 * so detect them from git's "Binary files ... differ" marker in the raw text.
 */
function binaryPaths(diffText: string): Set<string> {
  const paths = new Set<string>();
  const marker = /^Binary files (?:a\/)?(.+?) and (?:b\/)?(.+?) differ$/gm;
  for (const m of diffText.matchAll(marker)) {
    for (const p of [m[1], m[2]]) {
      if (p && p !== '/dev/null') paths.add(p);
    }
  }
  return paths;
}

function toHunkLine(change: parseDiff.Change): HunkLine[] {
  // "\ No newline at end of file" markers arrive as content starting with '\'
  if (change.content.startsWith('\\')) return [];
  const text = change.content.slice(1); // strip the +/-/space prefix
  switch (change.type) {
    case 'add':
      return [{ kind: 'add', text, newLine: change.ln }];
    case 'del':
      return [{ kind: 'del', text, oldLine: change.ln }];
    case 'normal':
      return [{ kind: 'context', text, oldLine: change.ln1, newLine: change.ln2 }];
  }
}

async function untrackedHunks(cwd: string): Promise<Hunk[]> {
  const git = simpleGit(cwd);
  const out = await git.raw(['ls-files', '--others', '--exclude-standard']);
  const paths = out.split('\n').filter((p) => p.length > 0);
  return paths.map((gitPath) => {
    // gitPath is '/'-separated; convert only at the filesystem boundary.
    const buf = readFileSync(path.join(cwd, ...gitPath.split('/')));
    if (buf.includes(0)) {
      return {
        file: gitPath,
        oldFile: null,
        status: 'binary' as const,
        oldStart: 0,
        oldLines: 0,
        newStart: 0,
        newLines: 0,
        lines: [],
      };
    }
    const text = buf.toString('utf8');
    const rawLines = text.split('\n');
    if (rawLines.at(-1) === '') rawLines.pop(); // trailing newline
    return {
      file: gitPath,
      oldFile: null,
      status: 'added' as const,
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: rawLines.length,
      lines: rawLines.map(
        (lineText, i): HunkLine => ({ kind: 'add', text: lineText.replace(/\r$/, ''), newLine: i + 1 }),
      ),
    };
  });
}
