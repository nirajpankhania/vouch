import { describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig } from '../src/config.js';

describe('config', () => {
  it('defaults to claude-sonnet-4-6 and the SPEC tool-call budget', () => {
    expect(defaultConfig.model).toBe('claude-sonnet-4-6');
    expect(defaultConfig.toolCallBudget).toBe(15);
  });

  it('resolveConfig applies a model override', () => {
    expect(resolveConfig({ model: 'claude-opus-4-8' }).model).toBe('claude-opus-4-8');
  });

  it('resolveConfig ignores undefined overrides (CLI passes undefined for unset flags)', () => {
    expect(resolveConfig({ model: undefined }).model).toBe(defaultConfig.model);
  });

  it('resolveConfig with no args returns the defaults', () => {
    expect(resolveConfig()).toEqual(defaultConfig);
  });
});
