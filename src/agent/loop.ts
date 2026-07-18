// The hand-written agentic loop. NO frameworks — this must stay small enough
// to narrate in an interview (agent-loop skill). It classifies each hunk by
// calling the model with read-only tools, enforces the tool-call budget
// itself, validates the JSON verdict with zod (one retry, then degrade), and
// tracks token cost. The Anthropic client is injected so tests use a fake.
import type Anthropic from '@anthropic-ai/sdk';
import type { CheckContext } from '../checks/types.js';
import type { VouchConfig } from '../config.js';
import {
  BUDGET_EXHAUSTED_PROMPT,
  buildInitialPrompt,
  buildRetryPrompt,
  buildSystemPrompt,
  DEFAULT_AGENTIC_CODES,
} from './prompts.js';
import { agentVerdictSchema, type AgentVerdict } from './schema.js';
import { executeTool, toolDefs, type AgentToolContext } from './tools.js';

/** Just the slice of the SDK we use — lets tests inject a scripted fake. */
export interface AgentClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
}

export interface AgentCost {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}

export interface AgentRunResult {
  verdict: AgentVerdict;
  /** false if the model never produced valid JSON and we degraded. */
  structured: boolean;
  cost: AgentCost;
}

export interface RunAgentOptions {
  client: AgentClient;
  config: VouchConfig;
  ctx: CheckContext;
  /** Repo root for the read-only tools. */
  cwd: string;
}

export async function runAgent(opts: RunAgentOptions): Promise<AgentRunResult> {
  const { client, config, ctx, cwd } = opts;
  const system = buildSystemPrompt(DEFAULT_AGENTIC_CODES);
  const toolCtx: AgentToolContext = { cwd };
  const cost: AgentCost = { inputTokens: 0, outputTokens: 0, toolCalls: 0 };
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildInitialPrompt(ctx.task, ctx.hunks) },
  ];

  let askedForVerdict = false;

  // Tool loop: run until the model answers with text instead of a tool call.
  for (;;) {
    const overBudget = cost.toolCalls >= config.toolCallBudget;
    if (overBudget && !askedForVerdict) {
      messages.push({ role: 'user', content: BUDGET_EXHAUSTED_PROMPT });
      askedForVerdict = true;
    }

    const res = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system,
      messages,
      // Drop tools once over budget so the model is forced to give its verdict.
      ...(overBudget ? {} : { tools: toolDefs as Anthropic.Tool[] }),
    });
    cost.inputTokens += res.usage.input_tokens;
    cost.outputTokens += res.usage.output_tokens;
    messages.push({ role: 'assistant', content: res.content });

    if (!overBudget && res.stop_reason === 'tool_use') {
      const toolUses = res.content.filter(isToolUse);
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (block) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: await executeTool(block.name, block.input, toolCtx),
        })),
      );
      cost.toolCalls += toolUses.length;
      messages.push({ role: 'user', content: results });
      continue;
    }
    break; // got a text response — time to parse the verdict
  }

  // Validate the verdict; one retry with the error appended, then degrade.
  let parsed = parseVerdict(lastText(messages));
  if (!parsed.ok) {
    messages.push({ role: 'user', content: buildRetryPrompt(parsed.error) });
    const res = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system,
      messages,
    });
    cost.inputTokens += res.usage.input_tokens;
    cost.outputTokens += res.usage.output_tokens;
    messages.push({ role: 'assistant', content: res.content });
    parsed = parseVerdict(lastText(messages));
  }

  if (parsed.ok) {
    return { verdict: parsed.value, structured: true, cost };
  }
  // Degrade: never crash on model output. Surface the raw text as the summary.
  const raw = lastText(messages).trim();
  return {
    verdict: { hunks: [], findings: [], summary: raw || '(agent produced no parseable verdict)' },
    structured: false,
    cost,
  };
}

function isToolUse(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === 'tool_use';
}

/** Concatenated text of the most recent assistant message. */
function lastText(messages: Anthropic.MessageParam[]): string {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant' || typeof last.content === 'string') {
    return typeof last?.content === 'string' ? last.content : '';
  }
  return last.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

type ParseResult =
  | { ok: true; value: AgentVerdict }
  | { ok: false; error: string };

function parseVerdict(text: string): ParseResult {
  const json = extractJson(text);
  if (json === null) return { ok: false, error: 'no JSON object found in response' };
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const result = agentVerdictSchema.safeParse(obj);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, value: result.data };
}

/** Pull a JSON object out of model text, tolerating ``` fences and prose. */
function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return candidate.slice(start, end + 1);
}
