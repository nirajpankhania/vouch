// ALL user-facing strings live here (cli-ux rule). Functions return strings;
// the CLI decides which stream — findings/summary to stdout, notices/errors
// to stderr so `vouch check --json | jq` always works.
import { createColors } from 'picocolors';
import type { Severity } from '../checks/types.js';
import type { VouchReport } from './json.js';

export interface RenderOptions {
  /** Force colors on/off; defaults to picocolors' own TTY detection. */
  colors?: boolean;
  durationMs?: number;
}

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
  lines.push(summaryLine(report, c, opts.durationMs));
  return lines.join('\n') + '\n';
}

function summaryLine(
  report: VouchReport,
  c: ReturnType<typeof createColors>,
  durationMs?: number,
): string {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of report.deterministic) counts[f.severity] += 1;

  const parts: string[] = [];
  if (counts.error) parts.push(`${counts.error} ${plural('error', counts.error)}`);
  if (counts.warn) parts.push(`${counts.warn} ${plural('warning', counts.warn)}`);
  if (counts.info) parts.push(`${counts.info} info`);

  const timing = durationMs === undefined ? '' : ` · ${Math.round(durationMs)}ms`;
  if (parts.length === 0) {
    return `${c.green('✓')} vouch: clean${timing}`;
  }
  const verdictWord =
    report.verdict === 'fail' ? c.red(report.verdict) : c.yellow(report.verdict);
  return `vouch: ${parts.join(', ')} · verdict: ${verdictWord}${timing}`;
}

/** stderr notice when the agent layer was requested but is unavailable. */
export function renderAgentUnavailable(): string {
  return [
    'ℹ Agent pass skipped — not available until Phase 4.',
    '  Deterministic checks ran; pass --no-agent to silence this notice.',
    '',
  ].join('\n');
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
