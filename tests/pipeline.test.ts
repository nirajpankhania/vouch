import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentClient } from '../src/agent/loop.js';
import { runPipeline } from '../src/pipeline.js';

const VERDICT = JSON.stringify({
  hunks: [{ file: 'a.ts', range: '1-1', classification: 'unrequested', reason: 'scope creep' }],
  summary: 'One unrelated change.',
});

function verdictClient(): AgentClient {
  return {
    messages: {
      create: async (): Promise<Anthropic.Message> =>
        ({
          id: 'm',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          stop_sequence: null,
          content: [{ type: 'text', text: VERDICT, citations: null }],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        }) as unknown as Anthropic.Message,
    },
  };
}

function throwingClient(): AgentClient {
  return { messages: { create: async () => { throw new Error('network down'); } } };
}

describe('runPipeline agent integration', () => {
  let cwd: string;
  let savedKey: string | undefined;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'vouch-pipe-'));
    const git = simpleGit(cwd);
    await git.raw(['init', '-b', 'main']);
    await git.addConfig('user.email', 'test@vouch.test');
    await git.addConfig('user.name', 'test');
    await git.addConfig('core.autocrlf', 'false');
    writeFileSync(path.join(cwd, 'a.ts'), 'export const A = 1;\n');
    await git.add('.');
    await git.commit('base');
    writeFileSync(path.join(cwd, 'a.ts'), 'export const A = 2;\n'); // working-tree change
    savedKey = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env['ANTHROPIC_API_KEY'];
    else process.env['ANTHROPIC_API_KEY'] = savedKey;
  });

  it('--no-agent skips the agent', async () => {
    const result = await runPipeline({ mode: { kind: 'working-tree' }, cwd, message: 'bump A', agent: false });
    expect(result.agentStatus).toBe('disabled');
    expect(result.report.agent).toEqual({ ran: false });
  });

  it('no API key degrades gracefully (deterministic still runs)', async () => {
    const result = await runPipeline({ mode: { kind: 'working-tree' }, cwd, message: 'bump A' });
    expect(result.agentStatus).toBe('no-api-key');
    expect(result.report.agent.ran).toBe(false);
  });

  it('injected client runs the agent; unrequested hunk drives the verdict', async () => {
    const result = await runPipeline({
      mode: { kind: 'working-tree' },
      cwd,
      message: 'bump A',
      agentClient: verdictClient(),
    });
    expect(result.agentStatus).toBe('ran');
    expect(result.report.agent.ran).toBe(true);
    if (result.report.agent.ran) {
      expect(result.report.agent.hunks[0]?.classification).toBe('unrequested');
      expect(result.report.agent.cost.inputTokens).toBe(100);
    }
    expect(result.report.verdict).toBe('review');
  });

  it('agent error degrades gracefully with a status + message', async () => {
    const result = await runPipeline({
      mode: { kind: 'working-tree' },
      cwd,
      message: 'bump A',
      agentClient: throwingClient(),
    });
    expect(result.agentStatus).toBe('error');
    expect(result.agentError).toContain('network down');
    expect(result.report.agent.ran).toBe(false);
  });
});
