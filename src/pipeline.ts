// Orchestrates one vouch run: gather context → deterministic checks →
// (Phase 4: agentic pass) → report. No user-facing output here.
import { allChecks } from './checks/index.js';
import type { CheckContext, Finding } from './checks/types.js';
import { getHunks, type DiffMode } from './context/diff.js';
import { buildProjectAccess } from './context/project.js';
import { resolveTask } from './context/task.js';
import { buildReport, type VouchReport } from './report/json.js';

export interface PipelineOptions {
  mode: DiffMode;
  /** -m flag value, if given. */
  message?: string;
  cwd?: string;
}

export interface PipelineResult {
  report: VouchReport;
  durationMs: number;
}

/** A check threw: that's a bug in vouch (exit 2), never a finding. */
export class CheckCrashError extends Error {
  constructor(
    readonly checkName: string,
    cause: unknown,
  ) {
    super(
      `internal error: the '${checkName}' check crashed (${cause instanceof Error ? cause.message : String(cause)}). ` +
        'This is a vouch bug — please report it.',
    );
  }
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const started = performance.now();
  const cwd = opts.cwd ?? process.cwd();

  const task = await resolveTask({ cwd, ...(opts.message !== undefined ? { message: opts.message } : {}) });
  const hunks = await getHunks(opts.mode, cwd);
  const ctx: CheckContext = {
    hunks,
    task,
    project: buildProjectAccess(hunks, cwd),
  };

  const findings: Finding[] = [];
  for (const check of allChecks) {
    try {
      findings.push(...check.run(ctx));
    } catch (cause) {
      throw new CheckCrashError(check.name, cause);
    }
  }

  return {
    report: buildReport(task, findings),
    durationMs: performance.now() - started,
  };
}
