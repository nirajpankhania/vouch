// Detects fake completeness: stub markers, hand-waved "rest of" comments,
// and empty bodies added by the diff. Regex over ADDED lines only — hunk
// fragments rarely parse as full ASTs, these idioms are line-local, and the
// kind: 'add' filter is what guarantees a *removed* TODO never flags.
import { isCodeFile } from './shared.js';
import type { Check, Confidence, Finding } from './types.js';

interface StubPattern {
  re: RegExp;
  reason: string;
  confidence: Confidence;
}

// Ordered by precision: first match wins per line.
const PATTERNS: readonly StubPattern[] = [
  {
    re: /not[ _-]?implemented/i,
    reason: 'explicit "not implemented" marker',
    confidence: 'high',
  },
  {
    re: /\brest of (?:the )?(?:implementation|file|code|function|logic)\b/i,
    reason: '"rest of ..." hand-wave',
    confidence: 'high',
  },
  {
    re: /\b(?:implementation|logic|code) (?:goes|would go) here\b/i,
    reason: '"goes here" stub comment',
    confidence: 'high',
  },
  {
    // Only inside comments — TODO in identifiers/strings is too noisy.
    re: /(?:\/\/|\/\*|^\s*\*)\s*.*\b(?:TODO|FIXME)\b/,
    reason: 'TODO/FIXME comment added',
    confidence: 'medium',
  },
  {
    // Named function declarations only. Arrow noops (`() => {}`) and
    // keyword blocks (`if (x) {}`) are idiomatic, not stubs.
    re: /\bfunction\s+\w+\s*\([^)]*\)[^{]*\{\s*\}/,
    reason: 'empty function body added',
    confidence: 'medium',
  },
];

export const placeholders: Check = {
  name: 'placeholders',
  run: (ctx) => {
    const findings: Finding[] = [];
    for (const hunk of ctx.hunks) {
      if (hunk.status === 'binary' || !isCodeFile(hunk.file)) continue;
      for (const line of hunk.lines) {
        if (line.kind !== 'add') continue;
        const match = PATTERNS.find((p) => p.re.test(line.text));
        if (!match) continue;
        findings.push({
          check: 'placeholders',
          code: 'placeholder-code',
          severity: 'warn',
          file: hunk.file,
          ...(line.newLine !== undefined ? { line: line.newLine } : {}),
          message: `${match.reason}: "${line.text.trim()}"`,
          confidence: match.confidence,
        });
      }
    }
    return findings;
  },
};
