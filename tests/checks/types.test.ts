import { describe, expect, it } from 'vitest';
import {
  AGENTIC_ISSUE_CODES,
  ALL_ISSUE_CODES,
  DETERMINISTIC_ISSUE_CODES,
} from '../../src/checks/types.js';
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

  it('exposes the curated agentic issue codes as a runtime registry (docs/PLAN.md Phase 6)', () => {
    expect(AGENTIC_ISSUE_CODES).toEqual([
      'request-unfulfilled',
      'unrequested-change',
      'unintended-removal',
      'dead-integration',
      'instruction-file-disobeyed',
      'docs-drift',
      'change-narration',
      'misleading-claim',
    ]);
  });

  it('merges both layers into ALL_ISSUE_CODES with no collisions', () => {
    // list-codes and per-code config validation enumerate this merged registry;
    // a code appearing in both layers would make per-code config ambiguous.
    expect(ALL_ISSUE_CODES).toEqual([
      ...DETERMINISTIC_ISSUE_CODES,
      ...AGENTIC_ISSUE_CODES,
    ]);
    expect(new Set(ALL_ISSUE_CODES).size).toBe(ALL_ISSUE_CODES.length);
  });

  it('every issue code is stable kebab-case (codes are user-facing API)', () => {
    for (const code of ALL_ISSUE_CODES) {
      expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});
