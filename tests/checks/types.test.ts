import { describe, expect, it } from 'vitest';
import { DETERMINISTIC_ISSUE_CODES } from '../../src/checks/types.js';
import type { Check, CheckContext, Finding, Hunk } from '../../src/checks/types.js';

// The contract is mostly compile-time; this locks the runtime shape a check
// implementation must satisfy and documents canonical usage.

const sampleHunk: Hunk = {
  file: 'src/example.ts',
  oldFile: null,
  status: 'modified',
  oldStart: 1,
  oldLines: 2,
  newStart: 1,
  newLines: 3,
  lines: [
    { kind: 'context', text: 'const a = 1;', oldLine: 1, newLine: 1 },
    { kind: 'del', text: 'const b = 2;', oldLine: 2 },
    { kind: 'add', text: 'const b = 3;', newLine: 2 },
    { kind: 'add', text: 'const c = 4;', newLine: 3 },
  ],
};

const ctx: CheckContext = {
  hunks: [sampleHunk],
  task: { text: 'change b and add c', source: 'flag' },
  project: { files: new Map([['src/example.ts', 'const a = 1;\nconst b = 3;\nconst c = 4;\n']]) },
};

describe('check contract', () => {
  it('a pure check consumes CheckContext and returns Finding[]', () => {
    const noop: Check = { name: 'noop', run: () => [] };
    expect(noop.run(ctx)).toEqual([]);
  });

  it('findings carry the fields the report layer depends on (docs/SPEC.md)', () => {
    const finding: Finding = {
      check: 'placeholders',
      code: 'placeholder-code',
      severity: 'warn',
      file: 'src/example.ts',
      line: 3,
      message: 'stub body added',
      confidence: 'high',
    };
    expect(Object.keys(finding).sort()).toEqual(
      ['check', 'code', 'confidence', 'file', 'line', 'message', 'severity'].sort(),
    );
  });

  it('exposes the deterministic issue codes as a runtime registry (codes are API)', () => {
    // Codes must be enumerable at runtime — `vouch list-codes` and per-code
    // config validation both read this array, not just the type.
    expect(DETERMINISTIC_ISSUE_CODES).toEqual([
      'placeholder-code',
      'test-tampering',
      'unresolved-import',
      'scope-drift',
    ]);
  });
});
