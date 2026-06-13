// Task extraction: -m flag → TASK.md → Claude Code transcript → interactive
// prompt. Returns TaskInfo with the source recorded so output can always say
// where the task text came from (docs/SPEC.md). A transcript-extracted task is
// never used silently: confirmed in a TTY, surfaced in the report otherwise.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { TaskInfo } from '../checks/types.js';
import { readTranscriptTask } from './transcript.js';

/** Thrown when no task source yields text; the CLI maps this to exit 2. */
export class TaskResolutionError extends Error {}

export interface ResolveTaskOptions {
  /** -m flag value. */
  message?: string;
  /** Repo root to look for TASK.md / encode for the transcript dir. */
  cwd?: string;
  /** Home dir for transcript lookup (tests). Defaults to os.homedir(). */
  homedir?: string;
  /** Override TTY detection (tests). Defaults to process.stdin.isTTY. */
  isTTY?: boolean;
  /** Prompt input stream (tests). Defaults to process.stdin. */
  input?: NodeJS.ReadableStream;
  /**
   * Prompt/confirmation output stream (tests). Defaults to process.stderr —
   * stdout is reserved for results so `vouch check --json | jq` always works.
   */
  output?: NodeJS.WritableStream;
}

export async function resolveTask(opts: ResolveTaskOptions = {}): Promise<TaskInfo> {
  const flag = opts.message?.trim();
  if (flag) return { text: flag, source: 'flag' };

  const cwd = opts.cwd ?? process.cwd();
  const fromFile = readTaskFile(cwd);
  if (fromFile) return { text: fromFile, source: 'taskfile' };

  // Best-effort: undefined if no transcript / no real task / any failure.
  const fromTranscript = readTranscriptTask({
    cwd,
    ...(opts.homedir !== undefined ? { homedir: opts.homedir } : {}),
  });

  const isTTY = opts.isTTY ?? Boolean(process.stdin.isTTY);
  if (!isTTY) {
    // Can't ask — auto-accept the guess (surfaced in the report by source),
    // or fail with an actionable message if there's nothing to fall back on.
    if (fromTranscript) return fromTranscript;
    throw new TaskResolutionError(
      'No task provided. Pass -m "<task>" or write the task into TASK.md in the repo root.',
    );
  }

  // One readline interface for the whole interactive flow: closing and
  // reopening on the same stream can drop buffered input.
  const output = opts.output ?? process.stderr;
  const rl = createInterface({ input: opts.input ?? process.stdin, output });
  try {
    if (fromTranscript) {
      output.write(
        `Detected task from your latest Claude Code session:\n  "${fromTranscript.text}"\n`,
      );
      const answer = (await rl.question('Use this as the task? [Y/n] ')).trim().toLowerCase();
      if (answer === '' || answer === 'y' || answer === 'yes') return fromTranscript;
    }
    const typed = (await rl.question('What did you ask the agent to do? ')).trim();
    if (!typed) {
      throw new TaskResolutionError(
        'No task provided at the prompt. Pass -m "<task>" or write TASK.md.',
      );
    }
    return { text: typed, source: 'prompt' };
  } finally {
    rl.close();
  }
}

function readTaskFile(cwd: string): string | undefined {
  try {
    const text = readFileSync(path.join(cwd, 'TASK.md'), 'utf8').trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined; // missing/unreadable TASK.md is simply "not this source"
  }
}
