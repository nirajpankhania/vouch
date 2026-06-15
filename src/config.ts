// Single source of truth for configuration. Two layers:
//  - VouchConfig: LLM settings (model never hardcoded at call sites — hard rule)
//  - ProjectConfig: the user's .vouch.json (project-level toggles, ignore list)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

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

// --- .vouch.json (project config) -----------------------------------------

/** Names of the deterministic checks — also the keys of the `checks` toggle. */
export const checkNames = ['placeholders', 'tests', 'imports', 'scope'] as const;
export type CheckName = (typeof checkNames)[number];

// strict() so a typo in a hand-written config (e.g. "ignored" vs "ignore") is
// reported, not silently ignored — config files are user-authored.
export const projectConfigSchema = z
  .object({
    /** Default model for the agentic pass. CLI --model overrides. */
    model: z.string().optional(),
    /** Default for whether the agentic pass runs. CLI --no-agent overrides. */
    agent: z.boolean().optional(),
    /** Default diff base ref (e.g. "main"). CLI --base/--staged override. */
    base: z.string().optional(),
    /** Glob paths excluded from BOTH the checks and the agent. */
    ignore: z.array(z.string()).optional(),
    /** Per-check enable/disable; omitted check defaults to enabled. */
    checks: z
      .object({
        placeholders: z.boolean().optional(),
        tests: z.boolean().optional(),
        imports: z.boolean().optional(),
        scope: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** Thrown when .vouch.json exists but is malformed; CLI maps to exit 2. */
export class ConfigError extends Error {}

/** Load .vouch.json from cwd. Absent → {}. Malformed → ConfigError. */
export function loadProjectConfig(cwd: string = process.cwd()): ProjectConfig {
  let raw: string;
  try {
    raw = readFileSync(path.join(cwd, '.vouch.json'), 'utf8');
  } catch {
    return {}; // no config file is the normal case
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw); // tolerate a leading UTF-8 BOM (Windows editors)
  } catch (err) {
    throw new ConfigError(`.vouch.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = projectConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(
      `.vouch.json is invalid: ${result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}

/** The default .vouch.json `vouch init` writes — valid against the schema. */
export function defaultVouchJson(): string {
  const defaults: ProjectConfig = {
    agent: true,
    ignore: [],
    checks: { placeholders: true, tests: true, imports: true, scope: true },
  };
  return JSON.stringify(defaults, null, 2) + '\n';
}
