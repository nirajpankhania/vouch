// Single source of truth for LLM configuration. Model IDs are NEVER hardcoded
// at call sites (CLAUDE.md hard rule) — they come from here, optionally
// overridden by `vouch check --model <id>`.

export interface VouchConfig {
  /** Anthropic model id for the agentic pass. */
  model: string;
  /** Hard cap on tool calls before the loop forces a verdict (docs/SPEC.md). */
  toolCallBudget: number;
  /** max_tokens per model response in the loop. */
  maxTokens: number;
}

export const defaultConfig: VouchConfig = {
  // Sonnet over Opus per docs/SPEC.md Layer 2: vouch runs on every diff and
  // cost transparency is part of the pitch. See docs/DECISIONS.md — flagged
  // for revisit if classification quality needs Opus. Override with --model.
  model: 'claude-sonnet-4-6',
  toolCallBudget: 15,
  maxTokens: 4096,
};

/**
 * Merge overrides over the defaults, ignoring undefined values — so the CLI
 * can pass flag values (`{ model: opts.model }`) straight through even when a
 * flag is unset. The mapped type accepts explicit `undefined` per property.
 */
export function resolveConfig(
  overrides: { [K in keyof VouchConfig]?: VouchConfig[K] | undefined } = {},
): VouchConfig {
  return {
    model: overrides.model ?? defaultConfig.model,
    toolCallBudget: overrides.toolCallBudget ?? defaultConfig.toolCallBudget,
    maxTokens: overrides.maxTokens ?? defaultConfig.maxTokens,
  };
}
