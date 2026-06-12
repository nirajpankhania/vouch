import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tests } from '../../src/checks/tests.js';
import type { CheckContext } from '../../src/checks/types.js';
import { parseDiffToHunks } from '../../src/context/diff.js';

function ctxFromFixture(name: string): CheckContext {
  const diff = readFileSync(new URL(`../fixtures/tests-check/${name}`, import.meta.url), 'utf8');
  return {
    hunks: parseDiffToHunks(diff),
    task: { text: 'irrelevant for this check', source: 'flag' },
    project: { files: new Map() },
  };
}

describe('tests check', () => {
  it('deleted test file is an error, and does not double-report as assertion loss', () => {
    expect(tests.run(ctxFromFixture('test-deleted.diff'))).toEqual([
      {
        check: 'tests',
        severity: 'error',
        file: 'tests/auth.test.ts',
        message: 'test file deleted',
        confidence: 'high',
      },
    ]);
  });

  it('flags added .skip and .only with exact lines', () => {
    expect(tests.run(ctxFromFixture('skip-added.diff'))).toEqual([
      {
        check: 'tests',
        severity: 'warn',
        file: 'tests/auth.test.ts',
        line: 5,
        message: `it.skip added (test disabled): "it.skip('accepts valid credentials', () => {"`,
        confidence: 'high',
      },
      {
        check: 'tests',
        severity: 'warn',
        file: 'tests/auth.test.ts',
        line: 9,
        message: `it.only added (every other test disabled): "it.only('rejects bad passwords', () => {"`,
        confidence: 'high',
      },
    ]);
  });

  it('flags net assertion loss when a test body is gutted but the test kept', () => {
    expect(tests.run(ctxFromFixture('assertions-gutted.diff'))).toEqual([
      {
        check: 'tests',
        severity: 'warn',
        file: 'tests/auth.test.ts',
        message: 'assertions removed: 2 deleted, 0 added in this diff',
        confidence: 'medium',
      },
    ]);
  });

  it('stays silent on a refactor that moves assertions (count unchanged)', () => {
    expect(tests.run(ctxFromFixture('clean-refactor.diff'))).toEqual([]);
  });

  it('ignores expect-like code removed from non-test files', () => {
    expect(tests.run(ctxFromFixture('non-test-expect-removed.diff'))).toEqual([]);
  });

  it('ignores .diff fixture files even under a tests/ path (docs/CAUGHT.md #1)', () => {
    const diff = readFileSync(
      new URL('../fixtures/placeholders/prose-and-fixtures.diff', import.meta.url),
      'utf8',
    );
    const ctx: CheckContext = {
      hunks: parseDiffToHunks(diff),
      task: { text: 'irrelevant for this check', source: 'flag' },
      project: { files: new Map() },
    };
    expect(tests.run(ctx)).toEqual([]);
  });
});
