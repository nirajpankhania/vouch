// --json output. The schema is API (docs/SPEC.md, version field) — changes
// require a version bump and a SPEC update.
import type { Finding, TaskInfo } from '../checks/types.js';

/** Phase 4 adds the ran:true variant with hunk classifications and cost. */
export type AgentSection = { ran: false };

export type Verdict = 'clean' | 'review' | 'fail';

export interface VouchReport {
  version: 1;
  task: TaskInfo;
  deterministic: Finding[];
  agent: AgentSection;
  verdict: Verdict;
}

export function buildReport(task: TaskInfo, findings: Finding[]): VouchReport {
  return {
    version: 1,
    task,
    deterministic: findings,
    agent: { ran: false },
    verdict: verdictOf(findings),
  };
}

/** Any error → fail; anything at all → review; nothing → clean. */
export function verdictOf(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'error')) return 'fail';
  if (findings.length > 0) return 'review';
  return 'clean';
}
