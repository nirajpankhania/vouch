import { describe, expect, it } from 'vitest';
import type { Finding } from '../../src/checks/types.js';
import { buildReport, verdictOf } from '../../src/report/json.js';
import { renderReport } from '../../src/report/terminal.js';

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
});
