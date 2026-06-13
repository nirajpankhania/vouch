import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveTask, TaskResolutionError } from '../../src/context/task.js';
import { encodeCwd } from '../../src/context/transcript.js';

describe('resolveTask priority chain (docs/SPEC.md)', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'vouch-task-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('-m flag wins over everything, even an existing TASK.md', async () => {
    writeFileSync(path.join(cwd, 'TASK.md'), 'from the file\n');
    const task = await resolveTask({ message: 'from the flag', cwd, isTTY: false });
    expect(task).toEqual({ text: 'from the flag', source: 'flag' });
  });

  it('TASK.md is used when no flag, content trimmed', async () => {
    writeFileSync(path.join(cwd, 'TASK.md'), '\nadd retry logic to the fetcher\n\n');
    const task = await resolveTask({ cwd, isTTY: false });
    expect(task).toEqual({ text: 'add retry logic to the fetcher', source: 'taskfile' });
  });

  it('whitespace-only -m falls through to TASK.md', async () => {
    writeFileSync(path.join(cwd, 'TASK.md'), 'real task');
    const task = await resolveTask({ message: '   ', cwd, isTTY: false });
    expect(task).toEqual({ text: 'real task', source: 'taskfile' });
  });

  it('empty TASK.md falls through (here: to the non-TTY error)', async () => {
    writeFileSync(path.join(cwd, 'TASK.md'), '\n  \n');
    await expect(resolveTask({ cwd, isTTY: false })).rejects.toThrow(TaskResolutionError);
  });

  it('non-TTY with no sources throws a typed, actionable error', async () => {
    await expect(resolveTask({ cwd, isTTY: false })).rejects.toThrow(/-m|TASK\.md/);
  });

  it('TTY with no sources prompts on the provided streams', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    input.write('fix the login bug\n');
    const task = await resolveTask({ cwd, isTTY: true, input, output });
    expect(task).toEqual({ text: 'fix the login bug', source: 'prompt' });
    expect(output.read()?.toString()).toContain('What did you ask the agent to do?');
  });

  it('empty answer at the prompt is an error, not an empty task', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    input.write('\n');
    await expect(resolveTask({ cwd, isTTY: true, input, output })).rejects.toThrow(
      TaskResolutionError,
    );
  });
});

describe('resolveTask transcript fallback (Phase 3)', () => {
  let cwd: string;
  let home: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'vouch-task-'));
    home = mkdtempSync(path.join(tmpdir(), 'vouch-home-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  /** Plant the session fixture as the cwd's newest transcript. */
  function plantTranscript(): void {
    const dir = path.join(home, '.claude', 'projects', encodeCwd(cwd));
    mkdirSync(dir, { recursive: true });
    const fixture = readFileSync(
      new URL('../fixtures/transcript/session.jsonl', import.meta.url),
      'utf8',
    );
    writeFileSync(path.join(dir, 'session.jsonl'), fixture);
  }

  it('non-TTY auto-accepts the transcript task (surfaced via source)', async () => {
    plantTranscript();
    const task = await resolveTask({ cwd, homedir: home, isTTY: false });
    expect(task).toEqual({
      text: 'and make sure it retries 3 times with backoff',
      source: 'transcript',
    });
  });

  it('-m flag still wins over an available transcript', async () => {
    plantTranscript();
    const task = await resolveTask({ message: 'explicit task', cwd, homedir: home, isTTY: false });
    expect(task).toEqual({ text: 'explicit task', source: 'flag' });
  });

  it('TTY: confirming (empty/Y) uses the transcript task', async () => {
    plantTranscript();
    const input = new PassThrough();
    const output = new PassThrough();
    input.write('\n'); // bare Enter = accept default [Y]
    const task = await resolveTask({ cwd, homedir: home, isTTY: true, input, output });
    expect(task).toEqual({
      text: 'and make sure it retries 3 times with backoff',
      source: 'transcript',
    });
    expect(output.read()?.toString()).toContain('Use this as the task?');
  });

  it('TTY: declining (n) falls through to the typed prompt', async () => {
    plantTranscript();
    const input = new PassThrough();
    const output = new PassThrough();
    // Deliver the typed task only once the prompt appears — a real TTY sends
    // lines with delay between them, not all at once.
    let printed = '';
    output.on('data', (chunk: Buffer) => {
      const s = chunk.toString();
      printed += s;
      if (s.includes('What did you ask the agent to do?')) {
        input.write('the task I actually typed\n');
      }
    });
    input.write('n\n');
    const task = await resolveTask({ cwd, homedir: home, isTTY: true, input, output });
    expect(task).toEqual({ text: 'the task I actually typed', source: 'prompt' });
    expect(printed).toContain('retries 3 times'); // echoed the detected task
    expect(printed).toContain('What did you ask the agent to do?');
  });
});
