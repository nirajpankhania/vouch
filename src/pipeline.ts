// Orchestrates one vouch run: gather context → deterministic checks →
// agentic pass → report. No user-facing output here.
import Anthropic from '@anthropic-ai/sdk';
import picomatch from 'picomatch';
import { runAgent, type AgentClient } from './agent/loop.js';
import { allChecks } from './checks/index.js';
import type { CheckContext, Finding } from './checks/types.js';
import { resolveConfig, type CheckName } from './config.js';
import { getHunks, type DiffMode } from './context/diff.js';
import { buildProjectAccess } from './context/project.js';
import { resolveTask } from './context/task.js';
import { buildReport, type AgentSection, type VouchReport } from './report/json.js';

export interface PipelineOptions {
  mode: DiffMode;
  /** -m flag value, if given. */
  message?: string;
  cwd?: string;
  /** false = --no-agent (deterministic layer only). Defaults to true. */
  agent?: boolean;
  /** --model override. */
  model?: string;
  /** Glob paths to exclude from checks and the agent (from .vouch.json). */
  ignore?: string[];
  /** Per-check enable/disable (from .vouch.json); omitted = enabled. */
  checks?: { [K in CheckName]?: boolean | undefined };
  /** Injected Anthropic client (tests). Defaults to a real one when a key exists. */
  agentClient?: AgentClient;
}

/** Why the agent did or didn't run — the CLI maps this to a stderr notice. */
export type AgentStatus = 'ran' | 'disabled' | 'no-api-key' | 'no-hunks' | 'error';

export interface PipelineResult {
  report: VouchReport;
  durationMs: number;
  agentStatus: AgentStatus;
  agentError?: string;
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

  // Drop ignored paths up front so they reach neither the checks nor the agent.
  const isIgnored =
    opts.ignore && opts.ignore.length > 0 ? picomatch(opts.ignore) : () => false;
  const hunks = (await getHunks(opts.mode, cwd)).filter((h) => !isIgnored(h.file));

  const ctx: CheckContext = {
    hunks,
    task,
    project: buildProjectAccess(hunks, cwd),
  };

  const enabledChecks = allChecks.filter(
    (check) => opts.checks?.[check.name as CheckName] !== false,
  );
  const findings: Finding[] = [];
  for (const check of enabledChecks) {
    try {
      findings.push(...check.run(ctx));
    } catch (cause) {
      throw new CheckCrashError(check.name, cause);
    }
  }

  const { section, status, error } = await maybeRunAgent(opts, ctx, cwd);

  return {
    report: buildReport(task, findings, section),
    durationMs: performance.now() - started,
    agentStatus: status,
    ...(error !== undefined ? { agentError: error } : {}),
  };
}

async function maybeRunAgent(
  opts: PipelineOptions,
  ctx: CheckContext,
  cwd: string,
): Promise<{ section: AgentSection; status: AgentStatus; error?: string }> {
  if (opts.agent === false) return { section: { ran: false }, status: 'disabled' };
  if (ctx.hunks.length === 0) return { section: { ran: false }, status: 'no-hunks' };

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  const client = opts.agentClient ?? (apiKey ? new Anthropic({ apiKey }) : undefined);
  if (!client) return { section: { ran: false }, status: 'no-api-key' };

  // Agent failures degrade gracefully (hard rule) — never crash the tool.
  try {
    const config = resolveConfig({ model: opts.model });
    const result = await runAgent({ client, config, ctx, cwd });
    return {
      section: {
        ran: true,
        hunks: result.verdict.hunks,
        summary: result.verdict.summary,
        cost: { ...result.cost },
      },
      status: 'ran',
    };
  } catch (err) {
    return {
      section: { ran: false },
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
