import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { placeholders } from '../../src/checks/placeholders.js';
import type { CheckContext } from '../../src/checks/types.js';
import { parseDiffToHunks } from '../../src/context/diff.js';

function ctxFromFixture(name: string): CheckContext {
  const diff = readFileSync(new URL(`../fixtures/placeholders/${name}`, import.meta.url), 'utf8');
  return {
    hunks: parseDiffToHunks(diff),
    task: { text: 'irrelevant for this check', source: 'flag' },
    project: { files: new Map() },
  };
}

describe('placeholders check', () => {
  it('flags stub idioms on added lines (true positive)', () => {
    const findings = placeholders.run(ctxFromFixture('stub-added.diff'));
    expect(findings).toEqual([
      {
        check: 'placeholders',
        code: 'placeholder-code',
        severity: 'warn',
        file: 'feature.ts',
        line: 2,
        message: `explicit "not implemented" marker: "throw new Error('not implemented');"`,
        confidence: 'high',
      },
      {
        check: 'placeholders',
        code: 'placeholder-code',
        severity: 'warn',
        file: 'feature.ts',
        line: 5,
        message: 'empty function body added: "export function emptyHelper() {}"',
        confidence: 'medium',
      },
      {
        check: 'placeholders',
        code: 'placeholder-code',
        severity: 'warn',
        file: 'feature.ts',
        line: 7,
        message: '"rest of ..." hand-wave: "// ... rest of the implementation"',
        confidence: 'high',
      },
      {
        check: 'placeholders',
        code: 'placeholder-code',
        severity: 'warn',
        file: 'orders.ts',
        line: 6,
        message: 'TODO/FIXME comment added: "// TODO: implement currency rounding"',
        confidence: 'medium',
      },
    ]);
  });

  it('does not flag real code, arrow noops, keyword-empty-blocks, or .placeholder (true negative)', () => {
    expect(placeholders.run(ctxFromFixture('clean-add.diff'))).toEqual([]);
  });

  it('does not flag REMOVED stubs — deleting a TODO is cleanup, not a stub', () => {
    expect(placeholders.run(ctxFromFixture('todo-removed.diff'))).toEqual([]);
  });

  it('does not flag prose or committed .diff fixtures (docs/CAUGHT.md #1)', () => {
    expect(placeholders.run(ctxFromFixture('prose-and-fixtures.diff'))).toEqual([]);
  });
});
