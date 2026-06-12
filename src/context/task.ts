// Task extraction: -m flag → TASK.md → (Phase 3: Claude Code transcript) →
// interactive prompt. Returns TaskInfo with the source recorded so output can
// always say where the task text came from (docs/SPEC.md).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { TaskInfo } from '../checks/types.js';

/** Thrown when no task source yields text; the CLI maps this to exit 2. */
export class TaskResolutionError extends Error {}

export interface ResolveTaskOptions {
  /** -m flag value. */
  message?: string;
  /** Repo root to look for TASK.md in. Defaults to process.cwd(). */
  cwd?: string;
  /** Override TTY detection (tests). Defaults to process.stdin.isTTY. */
  isTTY?: boolean;
  /** Prompt input stream (tests). Defaults to process.stdin. */
  input?: NodeJS.ReadableStream;
  /**
   * Prompt output stream (tests). Defaults to process.stderr — stdout is
   * reserved for results so `vouch check --json | jq` always works.
   */
  output?: NodeJS.WritableStream;
}

export async function resolveTask(opts: ResolveTaskOptions = {}): Promise<TaskInfo> {
  const flag = opts.message?.trim();
  if (flag) return { text: flag, source: 'flag' };

  const fromFile = readTaskFile(opts.cwd ?? process.cwd());
  if (fromFile) return { text: fromFile, source: 'taskfile' };

  // Phase 3 inserts the Claude Code transcript fallback here, between
  // taskfile and prompt (best-effort, never throws).

  const isTTY = opts.isTTY ?? Boolean(process.stdin.isTTY);
  if (!isTTY) {
    throw new TaskResolutionError(
      'No task provided. Pass -m "<task>" or write the task into TASK.md in the repo root.',
    );
  }
  return promptForTask(opts.input ?? process.stdin, opts.output ?? process.stderr);
}

function readTaskFile(cwd: string): string | undefined {
  try {
    const text = readFileSync(path.join(cwd, 'TASK.md'), 'utf8').trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined; // missing/unreadable TASK.md is simply "not this source"
  }
}

async function promptForTask(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<TaskInfo> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question('What did you ask the agent to do? ')).trim();
    if (!answer) {
      throw new TaskResolutionError(
        'No task provided at the prompt. Pass -m "<task>" or write TASK.md.',
      );
    }
    return { text: answer, source: 'prompt' };
  } finally {
    rl.close();
  }
}
