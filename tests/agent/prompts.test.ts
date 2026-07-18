import { describe, expect, it } from 'vitest';
import {
  AGENTIC_GUIDES,
  BUDGET_EXHAUSTED_PROMPT,
  buildInitialPrompt,
  buildRetryPrompt,
  buildSystemPrompt,
  DEFAULT_AGENTIC_CODES,
  hunkRangeLabel,
  SYSTEM_PROMPT,
} from '../../src/agent/prompts.js';
import { AGENTIC_ISSUE_CODES } from '../../src/checks/types.js';
import type { Hunk, TaskInfo } from '../../src/checks/types.js';

const task: TaskInfo = { text: 'add retry logic to the fetch client', source: 'flag' };

const hunk: Hunk = {
  file: 'src/client.ts',
  oldFile: null,
  status: 'modified',
  oldStart: 10,
  oldLines: 2,
  newStart: 10,
  newLines: 3,
  lines: [
    { kind: 'context', text: 'async function get(url) {', oldLine: 10, newLine: 10 },
    { kind: 'add', text: '  await retry(() => fetch(url));', newLine: 11 },
    { kind: 'del', text: '  return fetch(url);', oldLine: 11 },
  ],
};

describe('prompts', () => {
  it('system prompt names all three classifications and forbids quality judgements', () => {
    for (const cls of ['requested', 'supporting', 'unrequested']) {
      expect(SYSTEM_PROMPT).toContain(cls);
    }
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('not code quality');
  });

  it('initial prompt includes the task text, source, and each hunk with +/- lines', () => {
    const prompt = buildInitialPrompt(task, [hunk]);
    expect(prompt).toContain('add retry logic to the fetch client');
    expect(prompt).toContain('source: flag');
    expect(prompt).toContain('src/client.ts [10-12] (modified)');
    expect(prompt).toContain('+  await retry(() => fetch(url));');
    expect(prompt).toContain('-  return fetch(url);');
  });

  it('hunkRangeLabel uses the new-side range for modified, old-side for deleted', () => {
    expect(hunkRangeLabel(hunk)).toBe('10-12');
    expect(
      hunkRangeLabel({ ...hunk, status: 'deleted', oldStart: 4, oldLines: 3 }),
    ).toBe('4-6');
    expect(hunkRangeLabel({ ...hunk, status: 'binary' })).toBe('binary');
  });

  it('retry prompt embeds the validation error', () => {
    expect(buildRetryPrompt('hunks: Required')).toContain('hunks: Required');
  });

  it('budget-exhausted prompt asks for the verdict now', () => {
    expect(BUDGET_EXHAUSTED_PROMPT.toLowerCase()).toContain('budget');
  });
});

describe('agentic guide registry', () => {
  it('has a fully populated guide for every agentic code', () => {
    expect(Object.keys(AGENTIC_GUIDES).sort()).toEqual([...AGENTIC_ISSUE_CODES].sort());
    for (const guide of Object.values(AGENTIC_GUIDES)) {
      expect(guide.meaning).toBeTruthy();
      expect(guide.guide).toBeTruthy();
      // agent-loop skill: examples are the quality lever — fix them first.
      expect(guide.examples.length).toBeGreaterThanOrEqual(2);
      expect(guide.exceptions.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('DEFAULT_AGENTIC_CODES', () => {
  it('is the model-emittable five: no derived unrequested-change, no reserved codes', () => {
    expect(DEFAULT_AGENTIC_CODES).toEqual([
      'request-unfulfilled',
      'unintended-removal',
      'dead-integration',
      'instruction-file-disobeyed',
      'docs-drift',
    ]);
  });
});

describe('buildSystemPrompt', () => {
  it('with no codes reproduces the classification-only prompt (SYSTEM_PROMPT)', () => {
    expect(buildSystemPrompt([])).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).not.toContain('"findings"');
  });

  it('with codes appends exactly the requested guides plus the findings JSON shape', () => {
    const prompt = buildSystemPrompt(['dead-integration', 'docs-drift']);
    expect(prompt).toContain('### dead-integration');
    expect(prompt).toContain('### docs-drift');
    expect(prompt).toContain(AGENTIC_GUIDES['dead-integration'].guide);
    expect(prompt).toContain('"findings"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).not.toContain('misleading-claim');
  });

  it('keeps the classification rubric in every variant', () => {
    for (const prompt of [buildSystemPrompt([]), buildSystemPrompt(['docs-drift'])]) {
      for (const cls of ['requested', 'supporting', 'unrequested']) {
        expect(prompt).toContain(cls);
      }
      expect(prompt.toLowerCase()).toContain('not code quality');
    }
  });
});
