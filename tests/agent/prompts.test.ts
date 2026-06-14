import { describe, expect, it } from 'vitest';
import {
  BUDGET_EXHAUSTED_PROMPT,
  buildInitialPrompt,
  buildRetryPrompt,
  hunkRangeLabel,
  SYSTEM_PROMPT,
} from '../../src/agent/prompts.js';
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
