import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  encodeCwd,
  extractTaskFromTranscript,
  findLatestTranscript,
  readTranscriptTask,
} from '../../src/context/transcript.js';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/transcript/${name}`, import.meta.url), 'utf8');
}

describe('encodeCwd', () => {
  it('replaces path separators and the drive colon with dashes (observed format)', () => {
    expect(encodeCwd('C:\\Users\\niraj\\Documents\\coding\\vouch')).toBe(
      'C--Users-niraj-Documents-coding-vouch',
    );
  });

  it('handles POSIX absolute paths', () => {
    expect(encodeCwd('/home/dev/my-proj')).toBe('-home-dev-my-proj');
  });
});

describe('extractTaskFromTranscript', () => {
  it('returns the latest real user message, skipping approvals/commands/tool_results', () => {
    expect(extractTaskFromTranscript(fixture('session.jsonl'))).toBe(
      'and make sure it retries 3 times with backoff',
    );
  });

  it('tolerates malformed lines and still extracts from valid ones', () => {
    expect(extractTaskFromTranscript(fixture('malformed.jsonl'))).toBe(
      'implement the dark mode toggle in settings',
    );
  });

  it('returns undefined when the session has no real task (only tool_results/approvals)', () => {
    expect(extractTaskFromTranscript(fixture('empty-session.jsonl'))).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    expect(extractTaskFromTranscript('')).toBeUndefined();
  });
});

describe('findLatestTranscript + readTranscriptTask (temp homedir)', () => {
  let home: string;
  const cwd = 'C:\\fake\\proj';

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'vouch-home-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function projectDir(): string {
    const dir = path.join(home, '.claude', 'projects', encodeCwd(cwd));
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  it('returns undefined when the project dir does not exist', () => {
    expect(findLatestTranscript(home, cwd)).toBeUndefined();
    expect(readTranscriptTask({ homedir: home, cwd })).toBeUndefined();
  });

  it('returns undefined when the dir has no .jsonl files', () => {
    const dir = projectDir();
    writeFileSync(path.join(dir, 'notes.txt'), 'hi');
    expect(findLatestTranscript(home, cwd)).toBeUndefined();
  });

  it('picks the newest .jsonl by mtime and ignores subdirectories', () => {
    const dir = projectDir();
    mkdirSync(path.join(dir, 'memory')); // sibling subdir must be ignored
    const older = path.join(dir, 'old.jsonl');
    const newer = path.join(dir, 'new.jsonl');
    writeFileSync(older, fixture('malformed.jsonl'));
    writeFileSync(newer, fixture('session.jsonl'));
    const past = new Date(Date.now() - 60_000);
    utimesSync(older, past, past);

    expect(findLatestTranscript(home, cwd)).toBe(newer);
    expect(readTranscriptTask({ homedir: home, cwd })).toEqual({
      text: 'and make sure it retries 3 times with backoff',
      source: 'transcript',
    });
  });

  it('returns undefined (never throws) when the newest session has no task', () => {
    const dir = projectDir();
    writeFileSync(path.join(dir, 'a.jsonl'), fixture('empty-session.jsonl'));
    expect(readTranscriptTask({ homedir: home, cwd })).toBeUndefined();
  });
});
