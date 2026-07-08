// Heuristic scope creep detector: files that share NO tokens with the task
// text, judged from path segments and added-line identifiers. Findings are
// ALWAYS info/low (skill rule) — real semantic judgment is the Phase 4
// agent's job; this catches only "task says CSS, diff touches migrations".
import type { Check, Finding } from './types.js';

// Words so common in task phrasing they carry no scope signal.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'all',
  'fix', 'add', 'adds', 'update', 'make', 'change', 'implement', 'support',
  'use', 'bug', 'issue', 'error', 'should', 'not', 'now', 'new', 'can',
  'src', 'lib', 'index',
]);

// Files that legitimately ride along with most tasks — flagging them is noise.
const INFRA = new RegExp(
  [
    String.raw`(^|/)package(-lock)?\.json$`,
    String.raw`(^|/)(pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$`,
    String.raw`(^|/)tsconfig[^/]*\.json$`,
    String.raw`(^|/)\.git(ignore|attributes)$`,
    String.raw`(^|/)readme(\.[a-z]+)?$`,
    String.raw`(^|/)license[^/]*$`,
    String.raw`(^|/)\.github/`,
    String.raw`\.config\.[cm]?[jt]s$`,
    String.raw`(^|/)\.vouch\.json$`,
  ].join('|'),
  'i',
);

export const scope: Check = {
  name: 'scope',
  run: (ctx) => {
    const taskTokens = tokenize(ctx.task.text);
    // "fix it" has no scope signal; refusing to judge beats guessing.
    if (taskTokens.size < 2) return [];

    // Gather per-file evidence across all hunks: path is constant, added
    // lines accumulate.
    const evidence = new Map<string, string[]>();
    for (const hunk of ctx.hunks) {
      if (INFRA.test(hunk.file)) continue;
      const parts = evidence.get(hunk.file) ?? [hunk.file, hunk.oldFile ?? ''];
      for (const line of hunk.lines) {
        if (line.kind === 'add') parts.push(line.text);
      }
      evidence.set(hunk.file, parts);
    }

    const findings: Finding[] = [];
    for (const [file, parts] of evidence) {
      const fileTokens = tokenize(parts.join(' '));
      if (!overlaps(taskTokens, fileTokens)) {
        findings.push({
          check: 'scope',
          code: 'scope-drift',
          severity: 'info',
          file,
          message: `'${file}' shares no tokens with the task — possibly out of scope`,
          confidence: 'low',
        });
      }
    }
    return findings;
  },
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase → camel Case
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

/** Plural-tolerant intersection: 'import' matches 'imports'. */
function overlaps(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const token of a) {
    if (b.has(token) || b.has(`${token}s`) || (token.endsWith('s') && b.has(token.slice(0, -1)))) {
      return true;
    }
  }
  return false;
}
