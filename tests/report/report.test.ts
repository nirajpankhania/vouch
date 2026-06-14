import { describe, expect, it } from 'vitest';
import type { Finding } from '../../src/checks/types.js';
import { buildReport, verdictOf, type AgentSection } from '../../src/report/json.js';
import { renderAgentNotice, renderReport } from '../../src/report/terminal.js';

const agentRan = (unrequested: boolean): AgentSection => ({
  ran: true,
  hunks: [
    { file: 'src/a.ts', range: '1-3', classification: 'requested', reason: 'the ask' },
    ...(unrequested
      ? [{ file: 'src/z.ts', range: '5-9', classification: 'unrequested' as const, reason: 'unrelated logging' }]
      : []),
  ],
  summary: 'Mostly on task.',
  cost: { inputTokens: 1_000_000, outputTokens: 200_000, toolCalls: 4 },
});

const error: Finding = {
  check: 'imports',
  severity: 'error',
  file: 'src/a.ts',
  line: 3,
  message: "unresolved relative import './gone'",
  confidence: 'high',
};
const warn: Finding = {
  check: 'placeholders',
  severity: 'warn',
  file: 'src/b.ts',
  line: 10,
  message: 'TODO/FIXME comment added: "// TODO: finish"',
  confidence: 'medium',
};
const info: Finding = {
  check: 'scope',
  severity: 'info',
  file: 'src/c.ts',
  message: "'src/c.ts' shares no tokens with the task — possibly out of scope",
  confidence: 'low',
};

describe('verdict mapping (exit codes depend on this)', () => {
  it('any error → fail', () => {
    expect(verdictOf([warn, error, info])).toBe('fail');
  });
  it('findings without errors → review', () => {
    expect(verdictOf([warn, info])).toBe('review');
  });
  it('nothing → clean', () => {
    expect(verdictOf([])).toBe('clean');
  });
  it('agent unrequested hunk alone → review (agent is consequential)', () => {
    expect(verdictOf([], agentRan(true))).toBe('review');
  });
  it('agent ran with no unrequested + no findings → clean', () => {
    expect(verdictOf([], agentRan(false))).toBe('clean');
  });
});

describe('json report (schema is API, docs/SPEC.md)', () => {
  it('emits the exact v1 shape', () => {
    const report = buildReport({ text: 'fix imports', source: 'flag' }, [error]);
    expect(report).toEqual({
      version: 1,
      task: { text: 'fix imports', source: 'flag' },
      deterministic: [error],
      agent: { ran: false },
      verdict: 'fail',
    });
  });
});

describe('terminal rendering (colors off for assertions)', () => {
  it('one grep-able line per finding, summary always last', () => {
    const report = buildReport({ text: 'x y', source: 'flag' }, [error, warn, info]);
    const out = renderReport(report, { colors: false, durationMs: 42 });
    const lines = out.trimEnd().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      "✗ error src/a.ts:3  unresolved relative import './gone'  [imports]",
    );
    expect(lines[1]).toBe(
      '⚠ warn  src/b.ts:10  TODO/FIXME comment added: "// TODO: finish"  [placeholders]',
    );
    expect(lines[2]).toBe(
      "ℹ info  src/c.ts  'src/c.ts' shares no tokens with the task — possibly out of scope  [scope]",
    );
    expect(lines[3]).toBe('vouch: 1 error, 1 warning, 1 info · verdict: fail · 42ms');
  });

  it('clean run is a single ✓ line', () => {
    const report = buildReport({ text: 'x y', source: 'flag' }, []);
    const out = renderReport(report, { colors: false, durationMs: 7 });
    expect(out).toBe('✓ vouch: clean · 7ms\n');
  });

  it('echoes the task as a header line ONLY when extracted from a transcript', () => {
    const fromFlag = renderReport(buildReport({ text: 'do x', source: 'flag' }, []), {
      colors: false,
    });
    expect(fromFlag).not.toContain('task (from Claude Code session)');

    const fromTranscript = renderReport(
      buildReport({ text: 'add retry logic', source: 'transcript' }, []),
      { colors: false },
    );
    const lines = fromTranscript.trimEnd().split('\n');
    expect(lines[0]).toBe('ℹ task (from Claude Code session): "add retry logic"');
    expect(lines.at(-1)).toContain('vouch: clean'); // summary still last
  });

  it('renders unrequested hunks, the agent summary, and cost in USD', () => {
    const report = buildReport({ text: 'x y', source: 'flag' }, [], agentRan(true));
    const out = renderReport(report, { colors: false, durationMs: 50, model: 'claude-sonnet-4-6' });
    const lines = out.trimEnd().split('\n');
    expect(lines[0]).toBe('⚠ unreq src/z.ts [5-9]  unrelated logging  [agent]');
    expect(lines[1]).toBe('↳ agent: Mostly on task.');
    // 1M in * $3 + 0.2M out * $15 = $3 + $3 = $6.00; verdict review (unrequested)
    expect(lines[2]).toBe(
      'vouch: agent: 1 unrequested of 2 hunks · ~$6.00 (4 calls) · verdict: review · 50ms',
    );
  });

  it('clean run with a benign agent pass stays ✓ and shows the cost', () => {
    const report = buildReport({ text: 'x y', source: 'flag' }, [], agentRan(false));
    const out = renderReport(report, { colors: false, durationMs: 5, model: 'claude-sonnet-4-6' });
    const summary = out.trimEnd().split('\n').at(-1);
    expect(summary).toBe('✓ vouch: clean · agent: 0 unrequested of 1 hunk · ~$6.00 (4 calls) · 5ms');
  });

  it('agent notices: no-key and error explain and point to --no-agent', () => {
    expect(renderAgentNotice('no-api-key')).toContain('ANTHROPIC_API_KEY');
    expect(renderAgentNotice('no-api-key')).toContain('--no-agent');
    expect(renderAgentNotice('error', 'boom')).toContain('boom');
    expect(renderAgentNotice('ran')).toBe('');
    expect(renderAgentNotice('disabled')).toBe('');
  });
});
