import { describe, expect, it } from 'vitest';
import { agentVerdictSchema } from '../../src/agent/schema.js';

const valid = {
  hunks: [
    { file: 'src/a.ts', range: '1-10', classification: 'requested', reason: 'implements the ask' },
    { file: 'src/b.ts', range: '4-4', classification: 'unrequested', reason: 'unrelated logging' },
  ],
  summary: 'Mostly on-task; one unrelated change.',
};

describe('agentVerdictSchema', () => {
  it('accepts a well-formed verdict', () => {
    expect(agentVerdictSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown classification value', () => {
    const bad = { ...valid, hunks: [{ ...valid.hunks[0], classification: 'maybe' }] };
    expect(agentVerdictSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a missing summary', () => {
    const { summary, ...noSummary } = valid;
    void summary;
    expect(agentVerdictSchema.safeParse(noSummary).success).toBe(false);
  });

  it('strips unknown keys so extra fields from the model do not fail parsing', () => {
    const withExtra = { ...valid, extra: 'ignore me', hunks: valid.hunks };
    const parsed = agentVerdictSchema.parse(withExtra);
    expect(parsed).not.toHaveProperty('extra');
  });
});
