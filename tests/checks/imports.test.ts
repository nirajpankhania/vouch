import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { imports } from '../../src/checks/imports.js';
import type { CheckContext } from '../../src/checks/types.js';
import { parseDiffToHunks } from '../../src/context/diff.js';
import { buildProjectAccess } from '../../src/context/project.js';

const projectDir = fileURLToPath(new URL('../fixtures/imports/project/', import.meta.url));

function ctxFromFixture(name: string): CheckContext {
  const diff = readFileSync(new URL(`../fixtures/imports/${name}`, import.meta.url), 'utf8');
  const hunks = parseDiffToHunks(diff);
  return {
    hunks,
    task: { text: 'irrelevant for this check', source: 'flag' },
    project: buildProjectAccess(hunks, projectDir),
  };
}

describe('imports check', () => {
  it('resolvable relative import is clean', () => {
    expect(imports.run(ctxFromFixture('good.diff'))).toEqual([]);
  });

  it('installed typed package is clean', () => {
    expect(imports.run(ctxFromFixture('ok-package.diff'))).toEqual([]);
  });

  it('node builtin via node: prefix is clean', () => {
    expect(imports.run(ctxFromFixture('ok-builtin.diff'))).toEqual([]);
  });

  it('flags an import of a file that does not exist', () => {
    expect(imports.run(ctxFromFixture('bad-module.diff'))).toEqual([
      {
        check: 'imports',
        severity: 'error',
        file: 'bad-module.ts',
        line: 1,
        message: "unresolved relative import './nonexistent'",
        confidence: 'high',
      },
    ]);
  });

  it('flags a named import the target module does not export', () => {
    expect(imports.run(ctxFromFixture('bad-export.diff'))).toEqual([
      {
        check: 'imports',
        severity: 'error',
        file: 'bad-export.ts',
        line: 1,
        message: "'./util' has no exported member 'missingFn'",
        confidence: 'high',
      },
    ]);
  });

  it('flags an import of a package that is not installed', () => {
    expect(imports.run(ctxFromFixture('bad-package.diff'))).toEqual([
      {
        check: 'imports',
        severity: 'error',
        file: 'bad-package.ts',
        line: 1,
        message: "package 'left-pad' is imported but not installed",
        confidence: 'high',
      },
    ]);
  });

  it('returns nothing when no TS files were touched', () => {
    const ctx: CheckContext = {
      hunks: [],
      task: { text: 'x', source: 'flag' },
      project: { files: new Map() },
    };
    expect(imports.run(ctx)).toEqual([]);
  });
});
