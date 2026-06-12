// Do added imports actually resolve? Catches hallucinated modules, missing
// packages, and invented exports. Three tiers, all error/high:
//   1. relative import that doesn't resolve  → file doesn't exist
//   2. bare specifier not resolvable AND not in node_modules → not installed
//   3. named import from a PROJECT file that lacks that export → invented API
// Named-export verification is deliberately project-internal only: for npm
// packages "is it installed" is checkable, but "does it export X" is a
// types-availability lottery and a false accusation would destroy trust.
import { builtinModules } from 'node:module';
import type { Check, Finding } from './types.js';

const BUILTINS = new Set(builtinModules);

export const imports: Check = {
  name: 'imports',
  run: (ctx) => {
    const { tsFiles } = ctx.project;
    if (!tsFiles) return [];

    // newLine numbers added per file, across all of the file's hunks
    const addedLines = new Map<string, Set<number>>();
    for (const hunk of ctx.hunks) {
      if (!tsFiles.has(hunk.file)) continue;
      const set = addedLines.get(hunk.file) ?? new Set<number>();
      for (const line of hunk.lines) {
        if (line.kind === 'add' && line.newLine !== undefined) set.add(line.newLine);
      }
      addedLines.set(hunk.file, set);
    }

    const findings: Finding[] = [];
    for (const [file, lines] of addedLines) {
      if (lines.size === 0) continue;
      try {
        checkFile(file, lines, ctx, findings);
      } catch (err) {
        // One unparseable file must not abort the other files' checks.
        findings.push({
          check: 'imports',
          severity: 'warn',
          file,
          message: `could not analyze imports: ${err instanceof Error ? err.message : String(err)}`,
          confidence: 'low',
        });
      }
    }
    return findings;
  },
};

function checkFile(
  file: string,
  addedLines: ReadonlySet<number>,
  ctx: Parameters<Check['run']>[0],
  findings: Finding[],
): void {
  const source = ctx.project.tsFiles?.get(file);
  if (!source) return;

  for (const decl of source.getImportDeclarations()) {
    // An import counts as "added" if any of its lines (imports can span
    // several) is an added line in the diff.
    if (!rangeTouchesAdded(decl.getStartLineNumber(), decl.getEndLineNumber(), addedLines)) {
      continue;
    }
    const spec = decl.getModuleSpecifierValue();
    const line = decl.getStartLineNumber();
    const resolved = decl.getModuleSpecifierSourceFile();

    if (resolved) {
      // Typed npm package — installed and typed, nothing to flag. Export
      // verification only for project-internal files.
      if (resolved.getFilePath().includes('node_modules')) continue;
      const exported = resolved.getExportedDeclarations();
      for (const named of decl.getNamedImports()) {
        const name = named.getName();
        if (!exported.has(name)) {
          findings.push({
            check: 'imports',
            severity: 'error',
            file,
            line,
            message: `'${spec}' has no exported member '${name}'`,
            confidence: 'high',
          });
        }
      }
      continue;
    }

    if (spec.startsWith('.')) {
      findings.push({
        check: 'imports',
        severity: 'error',
        file,
        line,
        message: `unresolved relative import '${spec}'`,
        confidence: 'high',
      });
      continue;
    }

    if (spec.startsWith('node:') || BUILTINS.has(spec)) continue;

    const pkg = packageName(spec);
    const installed = ctx.project.installedPackages;
    if (installed?.has(pkg) || installed?.has(`@types/${pkg}`)) continue;
    findings.push({
      check: 'imports',
      severity: 'error',
      file,
      line,
      message: `package '${pkg}' is imported but not installed`,
      confidence: 'high',
    });
  }
}

function rangeTouchesAdded(
  start: number,
  end: number,
  added: ReadonlySet<number>,
): boolean {
  for (let l = start; l <= end; l += 1) {
    if (added.has(l)) return true;
  }
  return false;
}

function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? spec);
}
