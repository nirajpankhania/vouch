import { describe, expect, it } from 'vitest';
import type { AgentVerdict } from '../../src/agent/schema.js';
import type { Finding } from '../../src/checks/types.js';
import {
  agentFindingsOf,
  buildReport,
  verdictOf,
  type AgentFinding,
  type AgentSection,
} from '../../src/report/json.js';
import { renderAgentNotice, renderReport } from '../../src/report/terminal.js';

// Sections are built the way the pipeline builds them: findings derived from
// the verdict via agentFindingsOf, so these tests cover that integration too.
const agentRan = (unrequested: boolean): Extract<AgentSection, { ran: true }> => {
  const verdict: AgentVerdict = {
    hunks: [
      { file: 'src/a.ts', range: '1-3', classification: 'requested', reason: 'the ask' },
      ...(unrequested
        ? [{ file: 'src/z.ts', range: '5-9', classification: 'unrequested' as const, reason: 'unrelated logging' }]
        : []),
    ],
    findings: [],
    summary: 'Mostly on task.',
  };
  return {
    ran: true,
    hunks: verdict.hunks,
    findings: agentFindingsOf(verdict),
    summary: verdict.summary,
    cost: { inputTokens: 1_000_000, outputTokens: 200_000, toolCalls: 4 },
  };
};

const error: Finding = {
  check: 'imports',
  code: 'unresolved-import',
  severity: 'error',
  file: 'src/a.ts',
  line: 3,
  message: "unresolved relative import './gone'",
  confidence: 'high',
};
const warn: Finding = {
  check: 'placeholders',
  code: 'placeholder-code',
  severity: 'warn',
  file: 'src/b.ts',
  line: 10,
  message: 'TODO/FIXME comment added: "// TODO: finish"',
  confidence: 'medium',
};
const info: Finding = {
  check: 'scope',
  code: 'scope-drift',
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
  it('agent finding alone (no unrequested hunks) → review', () => {
    const finding: AgentFinding = {
      check: 'agent',
      code: 'request-unfulfilled',
      severity: 'warn',
      message: 'nothing logs retry attempts',
      confidence: 'high',
    };
    expect(verdictOf([], { ...agentRan(false), findings: [finding] })).toBe('review');
  });
  it('agent ran with no unrequested + no findings → clean', () => {
    expect(verdictOf([], agentRan(false))).toBe('clean');
  });
});

describe('agentFindingsOf (verdict → issue-coded findings)', () => {
  it('derives one unrequested-change finding per unrequested hunk, line from range start', () => {
    expect(agentFindingsOf({
      hunks: [
        { file: 'src/a.ts', range: '1-3', classification: 'requested', reason: 'the ask' },
        { file: 'src/z.ts', range: '5-9', classification: 'unrequested', reason: 'unrelated logging' },
      ],
      findings: [],
      summary: 's',
    })).toEqual([
      {
        check: 'agent',
        code: 'unrequested-change',
        severity: 'warn',
        file: 'src/z.ts',
        line: 5,
        message: 'unrelated logging',
        confidence: 'medium',
      },
    ]);
  });

  it('maps model findings to warn-severity agent findings, keeping optional file/line', () => {
    const findings = agentFindingsOf({
      hunks: [],
      findings: [
        { code: 'dead-integration', file: 'src/a.ts', line: 3, message: 'never called', confidence: 'medium' },
        { code: 'request-unfulfilled', message: 'no logging added', confidence: 'high' },
      ],
      summary: 's',
    });
    expect(findings).toEqual([
      { check: 'agent', code: 'dead-integration', severity: 'warn', file: 'src/a.ts', line: 3, message: 'never called', confidence: 'medium' },
      { check: 'agent', code: 'request-unfulfilled', severity: 'warn', message: 'no logging added', confidence: 'high' },
    ]);
  });

  it('drops model-emitted unrequested-change — derivation owns that code', () => {
    const findings = agentFindingsOf({
      hunks: [],
      findings: [{ code: 'unrequested-change', file: 'src/z.ts', message: 'dup', confidence: 'high' }],
      summary: 's',
    });
    expect(findings).toEqual([]);
  });

  it('does not derive a line from a non-numeric range (binary)', () => {
    const findings = agentFindingsOf({
      hunks: [{ file: 'img.png', range: 'binary', classification: 'unrequested', reason: 'unrelated asset' }],
      findings: [],
      summary: 's',
    });
    expect(findings[0]).not.toHaveProperty('line');
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
    // The tag is the issue CODE, not the check name — it must match what the
    // user writes in .vouch.json per-code config (codes are API, SPEC.md).
    expect(lines[0]).toBe(
      "✗ error src/a.ts:3  unresolved relative import './gone'  [unresolved-import]",
    );
    expect(lines[1]).toBe(
      '⚠ warn  src/b.ts:10  TODO/FIXME comment added: "// TODO: finish"  [placeholder-code]',
    );
    expect(lines[2]).toBe(
      "ℹ info  src/c.ts  'src/c.ts' shares no tokens with the task — possibly out of scope  [scope-drift]",
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

  it('renders agent findings like deterministic ones, then the summary and cost in USD', () => {
    const report = buildReport({ text: 'x y', source: 'flag' }, [], agentRan(true));
    const out = renderReport(report, { colors: false, durationMs: 50, model: 'claude-sonnet-4-6' });
    const lines = out.trimEnd().split('\n');
    // Same grep-able shape as deterministic findings; tag is the issue code.
    expect(lines[0]).toBe('⚠ warn  src/z.ts:5  unrelated logging  [unrequested-change]');
    expect(lines[1]).toBe('↳ agent: Mostly on task.');
    // 1M in * $3 + 0.2M out * $15 = $3 + $3 = $6.00; verdict review (unrequested)
    expect(lines[2]).toBe(
      'vouch: agent: 1 unrequested of 2 hunks · ~$6.00 (4 calls) · verdict: review · 50ms',
    );
  });

  it('renders a file-less agent finding without a location segment', () => {
    const section: AgentSection = {
      ...agentRan(false),
      findings: [
        { check: 'agent', code: 'request-unfulfilled', severity: 'warn', message: 'nothing logs retry attempts', confidence: 'high' },
      ],
    };
    const report = buildReport({ text: 'x y', source: 'flag' }, [], section);
    const lines = renderReport(report, { colors: false }).trimEnd().split('\n');
    expect(lines[0]).toBe('⚠ warn  nothing logs retry attempts  [request-unfulfilled]');
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
