import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scope } from '../../src/checks/scope.js';
import type { CheckContext } from '../../src/checks/types.js';
import { parseDiffToHunks } from '../../src/context/diff.js';

function ctxFromFixture(name: string, task: string): CheckContext {
  const diff = readFileSync(new URL(`../fixtures/scope/${name}`, import.meta.url), 'utf8');
  return {
    hunks: parseDiffToHunks(diff),
    task: { text: task, source: 'flag' },
    project: { files: new Map() },
  };
}

describe('scope check (heuristic — always info/low)', () => {
  it('flags only the file sharing no tokens with the task', () => {
    expect(scope.run(ctxFromFixture('mixed.diff', 'fix the login retry bug'))).toEqual([
      {
        check: 'scope',
        code: 'scope-drift',
        severity: 'info',
        file: 'src/billing/invoice.ts',
        message:
          "'src/billing/invoice.ts' shares no tokens with the task — possibly out of scope",
        confidence: 'low',
      },
    ]);
  });

  it('added identifiers rescue a file whose path says nothing (loginRetryLimit)', () => {
    expect(
      scope.run(ctxFromFixture('identifier-rescue.diff', 'fix the login retry bug')),
    ).toEqual([]);
  });

  it('never flags infra files (package.json, README)', () => {
    expect(scope.run(ctxFromFixture('infra.diff', 'fix the login retry bug'))).toEqual([]);
  });

  it('refuses to judge against a vague task (< 2 meaningful tokens)', () => {
    expect(scope.run(ctxFromFixture('mixed.diff', 'fix it'))).toEqual([]);
  });
});
