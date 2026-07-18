// The structured verdict the agent must return. Validated with zod in
// agent/loop.ts; this is the single source of truth for the shape that
// report/json.ts then serializes (docs/SPEC.md JSON schema).
import { z } from 'zod';
import { AGENTIC_ISSUE_CODES } from '../checks/types.js';

/** How a hunk relates to the task. */
export const classificationSchema = z.enum(['requested', 'supporting', 'unrequested']);

export const hunkVerdictSchema = z.object({
  /** Git-normalized path of the hunk's file. */
  file: z.string(),
  /** Human-readable line range, e.g. "12-20", echoed from the prompt. */
  range: z.string(),
  classification: classificationSchema,
  /** One sentence on why — especially required for `unrequested`. */
  reason: z.string(),
});

/**
 * One issue-coded finding from the model. Validated against the full agentic
 * taxonomy (not just the emittable subset) so a stray-but-valid code degrades
 * to a finding, never to a failed parse. file/line are optional: codes about
 * absence (request-unfulfilled) may have no location.
 */
export const agentFindingSchema = z.object({
  code: z.enum(AGENTIC_ISSUE_CODES),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  message: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const agentVerdictSchema = z.object({
  hunks: z.array(hunkVerdictSchema),
  // default([]) keeps classification-only output (and the budget-exhausted
  // path) parsing — the findings field is additive.
  findings: z.array(agentFindingSchema).default([]),
  summary: z.string(),
});

export type Classification = z.infer<typeof classificationSchema>;
export type HunkVerdict = z.infer<typeof hunkVerdictSchema>;
export type AgentModelFinding = z.infer<typeof agentFindingSchema>;
export type AgentVerdict = z.infer<typeof agentVerdictSchema>;
