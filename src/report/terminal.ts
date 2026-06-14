// ALL user-facing strings live here (cli-ux rule). Functions return strings;
// the CLI decides which stream — findings/summary to stdout, notices/errors
// to stderr so `vouch check --json | jq` always works.
import { createColors } from 'picocolors';
import type { Severity } from '../checks/types.js';
import type { AgentCost, VouchReport } from './json.js';
import type { AgentStatus } from '../pipeline.js';

export interface RenderOptions {
  /** Force colors on/off; defaults to picocolors' own TTY detection. */
  colors?: boolean;
  durationMs?: number;
  /** Model used for the agent pass, for the cost estimate. */
  model?: string;
}

// Input/output USD per 1M tokens, for the cost estimate (display only).
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

const SYMBOL: Record<Severity, string> = { error: '✗', warn: '⚠', info: 'ℹ' };

export function renderReport(report: VouchReport, opts: RenderOptions = {}): string {
  const c = createColors(opts.colors);
  const paint: Record<Severity, (s: string) => string> = {
    error: c.red,
    warn: c.yellow,
    info: c.dim,
  };

  const lines: string[] = [];
  // Surface a transcript-guessed task so a non-TTY run never judges against a
  // wrongly-extracted task silently (docs/SPEC.md). Other sources were typed
  // by the user, so they need no echo.
  if (report.task.source === 'transcript') {
    lines.push(c.dim(`ℹ task (from Claude Code session): "${report.task.text}"`));
  }
  for (const f of report.deterministic) {
    const location = f.line === undefined ? f.file : `${f.file}:${f.line}`;
    lines.push(
      `${paint[f.severity](`${SYMBOL[f.severity]} ${f.severity.padEnd(5)}`)} ${location}  ${f.message}  ${c.dim(`[${f.check}]`)}`,
    );
  }
  // Agent layer: list the scope-creep hunks (the actionable ones) and echo the
  // model's prose summary. requested/supporting are folded into the summary.
  if (report.agent.ran) {
    for (const h of report.agent.hunks.filter((x) => x.classification === 'unrequested')) {
      lines.push(`${c.yellow('⚠ unreq')} ${h.file} [${h.range}]  ${h.reason}  ${c.dim('[agent]')}`);
    }
    if (report.agent.summary.trim().length > 0) {
      lines.push(c.dim(`↳ agent: ${report.agent.summary.trim()}`));
    }
  }
  lines.push(summaryLine(report, c, opts.durationMs, opts.model));
  return lines.join('\n') + '\n';
}

function summaryLine(
  report: VouchReport,
  c: ReturnType<typeof createColors>,
  durationMs?: number,
  model?: string,
): string {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of report.deterministic) counts[f.severity] += 1;

  const detParts: string[] = [];
  if (counts.error) detParts.push(`${counts.error} ${plural('error', counts.error)}`);
  if (counts.warn) detParts.push(`${counts.warn} ${plural('warning', counts.warn)}`);
  if (counts.info) detParts.push(`${counts.info} info`);

  const segments: string[] = [];
  if (detParts.length > 0) segments.push(detParts.join(', '));
  if (report.agent.ran) segments.push(agentSegment(report.agent.hunks, report.agent.cost, model));

  const timing = durationMs === undefined ? '' : ` · ${Math.round(durationMs)}ms`;
  const tail = segments.length > 0 ? ` · ${segments.join(' · ')}` : '';

  if (report.verdict === 'clean') {
    return `${c.green('✓')} vouch: clean${tail}${timing}`;
  }
  const verdictWord =
    report.verdict === 'fail' ? c.red(report.verdict) : c.yellow(report.verdict);
  return `vouch: ${segments.join(' · ')} · verdict: ${verdictWord}${timing}`;
}

function agentSegment(
  hunks: { classification: string }[],
  cost: AgentCost,
  model?: string,
): string {
  const unreq = hunks.filter((h) => h.classification === 'unrequested').length;
  return `agent: ${unreq} unrequested of ${hunks.length} ${plural('hunk', hunks.length)} · ${costString(cost, model)}`;
}

function costString(cost: AgentCost, model?: string): string {
  const calls = `${cost.toolCalls} ${plural('call', cost.toolCalls)}`;
  const price = model ? PRICING[model] : undefined;
  if (!price) {
    return `${cost.inputTokens + cost.outputTokens} tok, ${calls}`;
  }
  const usd = (cost.inputTokens / 1e6) * price.in + (cost.outputTokens / 1e6) * price.out;
  return `~$${usd.toFixed(usd < 0.01 ? 4 : 2)} (${calls})`;
}

/** stderr notice explaining why the agent did or didn't run. Empty = nothing. */
export function renderAgentNotice(status: AgentStatus, error?: string): string {
  switch (status) {
    case 'no-api-key':
      return [
        '✗ No ANTHROPIC_API_KEY found — ran deterministic checks only.',
        '  Set the key to enable intent analysis: export ANTHROPIC_API_KEY=sk-...',
        '  Or pass --no-agent to silence this notice.',
        '',
      ].join('\n');
    case 'error':
      return [
        `⚠ Agent pass failed — ran deterministic checks only.`,
        `  ${error ?? 'unknown error'}`,
        '  Re-run, or pass --no-agent to skip the agent.',
        '',
      ].join('\n');
    default:
      return ''; // ran / disabled / no-hunks need no notice
  }
}

/** Every failure mode: what happened, why probably, what to do next (≤3 lines). */
export function renderError(err: unknown, debug = false): string {
  const message = err instanceof Error ? err.message : String(err);
  const lines = [`✗ ${message}`];
  if (debug && err instanceof Error && err.stack) {
    lines.push(err.stack);
  } else {
    lines.push('  Run with --debug for the full stack trace.');
  }
  return lines.join('\n') + '\n';
}

function plural(word: string, n: number): string {
  return n === 1 ? word : `${word}s`;
}
