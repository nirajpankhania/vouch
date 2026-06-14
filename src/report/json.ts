// --json output. The schema is API (docs/SPEC.md, version field) — changes
// require a version bump and a SPEC update.
import type { Classification } from '../agent/schema.js';
import type { Finding, TaskInfo } from '../checks/types.js';

export interface AgentHunk {
  file: string;
  range: string;
  classification: Classification;
  reason: string;
}

export interface AgentCost {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}

export type AgentSection =
  | { ran: false }
  | { ran: true; hunks: AgentHunk[]; summary: string; cost: AgentCost };

export type Verdict = 'clean' | 'review' | 'fail';

export interface VouchReport {
  version: 1;
  task: TaskInfo;
  deterministic: Finding[];
  agent: AgentSection;
  verdict: Verdict;
}

export function buildReport(
  task: TaskInfo,
  findings: Finding[],
  agent: AgentSection = { ran: false },
): VouchReport {
  return {
    version: 1,
    task,
    deterministic: findings,
    agent,
    verdict: verdictOf(findings, agent),
  };
}

/**
 * Any deterministic error → fail. Otherwise any deterministic finding OR an
 * agent-flagged unrequested hunk → review. Else clean. The agent layer is
 * consequential: scope creep alone produces a non-clean verdict (exit 1).
 */
export function verdictOf(findings: Finding[], agent: AgentSection = { ran: false }): Verdict {
  if (findings.some((f) => f.severity === 'error')) return 'fail';
  const hasUnrequested = agent.ran && agent.hunks.some((h) => h.classification === 'unrequested');
  if (findings.length > 0 || hasUnrequested) return 'review';
  return 'clean';
}
