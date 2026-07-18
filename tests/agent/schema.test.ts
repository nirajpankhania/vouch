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
  it('accepts a well-formed verdict, defaulting an absent findings array to []', () => {
    // Pre-findings model output (and the budget/degrade paths) must keep parsing.
    expect(agentVerdictSchema.parse(valid)).toEqual({ ...valid, findings: [] });
  });

  it('accepts issue-coded findings', () => {
    const withFindings = {
      ...valid,
      findings: [
        {
          code: 'dead-integration',
          file: 'src/a.ts',
          line: 3,
          message: 'validateInput() is never called',
          confidence: 'medium',
        },
        // file/line are optional — request-unfulfilled is about absence.
        { code: 'request-unfulfilled', message: 'nothing logs retry attempts', confidence: 'high' },
      ],
    };
    expect(agentVerdictSchema.parse(withFindings)).toEqual(withFindings);
  });

  it('rejects a finding with a code outside the agentic taxonomy', () => {
    const bad = {
      ...valid,
      findings: [{ code: 'made-up-code', message: 'x', confidence: 'high' }],
    };
    expect(agentVerdictSchema.safeParse(bad).success).toBe(false);
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
