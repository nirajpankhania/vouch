// The structured verdict the agent must return. Validated with zod in
// agent/loop.ts; this is the single source of truth for the shape that
// report/json.ts then serializes (docs/SPEC.md JSON schema).
import { z } from 'zod';

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

export const agentVerdictSchema = z.object({
  hunks: z.array(hunkVerdictSchema),
  summary: z.string(),
});

export type Classification = z.infer<typeof classificationSchema>;
export type HunkVerdict = z.infer<typeof hunkVerdictSchema>;
export type AgentVerdict = z.infer<typeof agentVerdictSchema>;
