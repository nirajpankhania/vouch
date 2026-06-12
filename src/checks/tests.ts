// Detects a quietly weakened safety net: deleted test files, added
// .skip/.only (and x-variants), and test bodies gutted of assertions.
// Counting assertions beats AST body-matching here: a refactor that MOVES
// assertions nets to zero and stays silent; only real loss flags.
import type { Check, Finding } from './types.js';

const SKIP_MARKER = /\b(?:describe|it|test)\.(?:skip|only)\b|\bx(?:describe|it|test)\s*\(/;

const ASSERTION = /\bexpect\s*\(|\bassert\s*\(|\bassert\.\w+\s*\(/;

function isTestFile(gitPath: string): boolean {
  return (
    /(?:^|\/)(?:tests?|__tests__)\//.test(gitPath) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(gitPath)
  );
}

export const tests: Check = {
  name: 'tests',
  run: (ctx) => {
    const findings: Finding[] = [];
    const deletedReported = new Set<string>();
    const assertionTally = new Map<string, { del: number; add: number }>();

    for (const hunk of ctx.hunks) {
      if (hunk.status === 'binary' || !isTestFile(hunk.file)) continue;

      if (hunk.status === 'deleted') {
        // The strongest finding for this file; counting its assertions too
        // would just double-report the same loss.
        if (!deletedReported.has(hunk.file)) {
          deletedReported.add(hunk.file);
          findings.push({
            check: 'tests',
            severity: 'error',
            file: hunk.file,
            message: 'test file deleted',
            confidence: 'high',
          });
        }
        continue;
      }

      for (const line of hunk.lines) {
        if (line.kind === 'add') {
          const skip = line.text.match(SKIP_MARKER);
          if (skip) {
            const marker = skip[0].replace(/\s*\($/, '');
            const effect = marker.endsWith('.only')
              ? 'every other test disabled'
              : 'test disabled';
            findings.push({
              check: 'tests',
              severity: 'warn',
              file: hunk.file,
              ...(line.newLine !== undefined ? { line: line.newLine } : {}),
              message: `${marker} added (${effect}): "${line.text.trim()}"`,
              confidence: 'high',
            });
          }
        }
        if (line.kind !== 'context' && ASSERTION.test(line.text)) {
          const tally = assertionTally.get(hunk.file) ?? { del: 0, add: 0 };
          if (line.kind === 'del') tally.del += 1;
          else tally.add += 1;
          assertionTally.set(hunk.file, tally);
        }
      }
    }

    for (const [file, { del, add }] of assertionTally) {
      if (del > add) {
        findings.push({
          check: 'tests',
          severity: 'warn',
          file,
          message: `assertions removed: ${del} deleted, ${add} added in this diff`,
          confidence: 'medium',
        });
      }
    }

    return findings;
  },
};
