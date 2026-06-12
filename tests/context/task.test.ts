import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveTask, TaskResolutionError } from '../../src/context/task.js';

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
