// --json output. The schema is API (docs/SPEC.md, version field). Additive
// changes (new fields) keep the version and update the SPEC; breaking changes
// (rename/remove/retype) require a version bump.
import type { AgentVerdict, Classification } from '../agent/schema.js';
import type {
  AgenticIssueCode,
  Confidence,
  Finding,
  Severity,
  TaskInfo,
} from '../checks/types.js';

export interface AgentHunk {
  file: string;
  range: string;
  classification: Classification;
  reason: string;
}

/**
 * An agent-layer finding, same shape as a deterministic Finding except `file`
 * is optional: codes about absence (request-unfulfilled) may have no location.
 */
export interface AgentFinding {
  check: 'agent';
  code: AgenticIssueCode;
  severity: Severity;
  file?: string;
  line?: number;
  message: string;
  confidence: Confidence;
}

export interface AgentCost {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}

export type AgentSection =
  | { ran: false }
  | { ran: true; hunks: AgentHunk[]; findings: AgentFinding[]; summary: string; cost: AgentCost };

/**
 * Materialize a verdict as issue-coded findings: the model's own findings
 * (all warn severity — LLM judgment is never an objective error), plus one
 * derived `unrequested-change` per unrequested hunk. The model is told never
 * to emit `unrequested-change` itself; if it does anyway, we drop it here so
 * derivation stays the single source of that code (no double-reporting).
 */
export function agentFindingsOf(verdict: AgentVerdict): AgentFinding[] {
  const reported: AgentFinding[] = verdict.findings
    .filter((f) => f.code !== 'unrequested-change')
    .map((f) => ({
      check: 'agent',
      code: f.code,
      severity: 'warn',
      ...(f.file !== undefined ? { file: f.file } : {}),
      ...(f.line !== undefined ? { line: f.line } : {}),
      message: f.message,
      confidence: f.confidence,
    }));
  const derived: AgentFinding[] = verdict.hunks
    .filter((h) => h.classification === 'unrequested')
    .map((h) => {
      const rangeStart = Number.parseInt(h.range, 10);
      return {
        check: 'agent' as const,
        code: 'unrequested-change' as const,
        severity: 'warn' as const,
        file: h.file,
        ...(Number.isFinite(rangeStart) ? { line: rangeStart } : {}),
        message: h.reason,
        confidence: 'medium' as const,
      };
    });
  return [...reported, ...derived];
}

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
 * Any deterministic error → fail. Otherwise any deterministic finding OR any
 * agent finding → review. Else clean. The agent layer is consequential: scope
 * creep alone produces a non-clean verdict (exit 1). Unrequested hunks are
 * checked directly too — belt and braces, in case future per-code config
 * filters the derived findings.
 */
export function verdictOf(findings: Finding[], agent: AgentSection = { ran: false }): Verdict {
  if (findings.some((f) => f.severity === 'error')) return 'fail';
  const agentFlagged =
    agent.ran &&
    (agent.findings.length > 0 || agent.hunks.some((h) => h.classification === 'unrequested'));
  if (findings.length > 0 || agentFlagged) return 'review';
  return 'clean';
}
