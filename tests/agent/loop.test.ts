import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAgent, type AgentClient } from '../../src/agent/loop.js';
import type { CheckContext } from '../../src/checks/types.js';
import { defaultConfig } from '../../src/config.js';

// --- helpers to build fake Anthropic.Message responses ---------------------

function textMessage(text: string): Anthropic.Message {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [{ type: 'text', text, citations: null }],
    usage: usage(),
  } as unknown as Anthropic.Message;
}

function toolUseMessage(name: string, input: unknown): Anthropic.Message {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [{ type: 'tool_use', id: `tu_${Math.random().toString(36).slice(2)}`, name, input }],
    usage: usage(),
  } as unknown as Anthropic.Message;
}

function usage() {
  return { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
}

const VALID_VERDICT = JSON.stringify({
  hunks: [{ file: 'src/a.ts', range: '1-3', classification: 'requested', reason: 'implements the ask' }],
  summary: 'On task.',
});

/** A client that replays a scripted queue of responses. */
function scriptedClient(responses: Anthropic.Message[]): AgentClient & { calls: number } {
  let i = 0;
  const client = {
    calls: 0,
    messages: {
      create: async (): Promise<Anthropic.Message> => {
        client.calls += 1;
        const res = responses[i];
        i += 1;
        if (!res) throw new Error('scripted client ran out of responses');
        return res;
      },
    },
  };
  return client;
}

const ctx: CheckContext = {
  hunks: [
    {
      file: 'src/a.ts',
      oldFile: null,
      status: 'added',
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 3,
      lines: [{ kind: 'add', text: 'export const A = 1;', newLine: 1 }],
    },
  ],
  task: { text: 'add constant A', source: 'flag' },
  project: { files: new Map() },
};

describe('runAgent', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'vouch-loop-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('happy path: parses a valid verdict and accumulates cost', async () => {
    const client = scriptedClient([textMessage(VALID_VERDICT)]);
    const result = await runAgent({ client, config: defaultConfig, ctx, cwd });
    expect(result.structured).toBe(true);
    expect(result.verdict.hunks[0]?.classification).toBe('requested');
    expect(result.cost).toEqual({ inputTokens: 10, outputTokens: 5, toolCalls: 0 });
  });

  it('runs a tool call then parses the verdict', async () => {
    const client = scriptedClient([
      toolUseMessage('read_file', { path: 'src/a.ts' }),
      textMessage(VALID_VERDICT),
    ]);
    const result = await runAgent({ client, config: defaultConfig, ctx, cwd });
    expect(result.structured).toBe(true);
    expect(result.cost.toolCalls).toBe(1);
    expect(client.calls).toBe(2);
  });

  it('tolerates a JSON verdict wrapped in code fences', async () => {
    const client = scriptedClient([textMessage('```json\n' + VALID_VERDICT + '\n```')]);
    const result = await runAgent({ client, config: defaultConfig, ctx, cwd });
    expect(result.structured).toBe(true);
  });

  it('enforces the tool-call budget then forces a verdict', async () => {
    // A client that loops forever on tools while tools are offered, and emits
    // the verdict only once tools are withheld (over budget).
    let calls = 0;
    const client: AgentClient & { calls: number } = {
      calls: 0,
      messages: {
        create: async (body): Promise<Anthropic.Message> => {
          calls += 1;
          client.calls = calls;
          return body.tools ? toolUseMessage('list_dir', {}) : textMessage(VALID_VERDICT);
        },
      },
    };
    const config = { ...defaultConfig, toolCallBudget: 3 };
    const result = await runAgent({ client, config, ctx, cwd });
    expect(result.cost.toolCalls).toBe(3); // stopped exactly at budget
    expect(result.structured).toBe(true);
    expect(client.calls).toBe(4); // 3 tool turns + 1 forced verdict
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    const client = scriptedClient([
      textMessage('I think it looks fine, honestly.'),
      textMessage(VALID_VERDICT),
    ]);
    const result = await runAgent({ client, config: defaultConfig, ctx, cwd });
    expect(result.structured).toBe(true);
    expect(client.calls).toBe(2);
  });

  it('degrades to an unstructured summary after two bad responses', async () => {
    const client = scriptedClient([
      textMessage('no json here'),
      textMessage('still no json'),
    ]);
    const result = await runAgent({ client, config: defaultConfig, ctx, cwd });
    expect(result.structured).toBe(false);
    expect(result.verdict.hunks).toEqual([]);
    expect(result.verdict.findings).toEqual([]);
    expect(result.verdict.summary).toBe('still no json');
  });

  it('sends the guide-bearing system prompt and passes model findings through', async () => {
    const verdictWithFindings = JSON.stringify({
      hunks: [{ file: 'src/a.ts', range: '1-3', classification: 'requested', reason: 'the ask' }],
      findings: [
        { code: 'dead-integration', file: 'src/a.ts', message: 'A is exported but never imported', confidence: 'medium' },
      ],
      summary: 'On task, but A is unused.',
    });
    let system: string | undefined;
    const client: AgentClient = {
      messages: {
        create: async (body): Promise<Anthropic.Message> => {
          system = typeof body.system === 'string' ? body.system : undefined;
          return textMessage(verdictWithFindings);
        },
      },
    };
    const result = await runAgent({ client, config: defaultConfig, ctx, cwd });
    expect(result.structured).toBe(true);
    expect(result.verdict.findings[0]?.code).toBe('dead-integration');
    // The loop enables exactly the emittable codes: guides present for those,
    // absent for derived unrequested-change and the Phase 9 reserved pair.
    expect(system).toContain('### dead-integration');
    expect(system).toContain('### request-unfulfilled');
    expect(system).not.toContain('### unrequested-change');
    expect(system).not.toContain('misleading-claim');
  });
});
