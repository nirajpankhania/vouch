import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConfigError,
  defaultConfig,
  defaultVouchJson,
  loadProjectConfig,
  projectConfigSchema,
  resolveConfig,
} from '../src/config.js';

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

describe('loadProjectConfig (.vouch.json)', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'vouch-cfg-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns {} when no .vouch.json exists', () => {
    expect(loadProjectConfig(cwd)).toEqual({});
  });

  it('parses a valid config', () => {
    writeFileSync(
      path.join(cwd, '.vouch.json'),
      JSON.stringify({ model: 'claude-opus-4-8', ignore: ['tests/fixtures/**'], checks: { scope: false } }),
    );
    expect(loadProjectConfig(cwd)).toEqual({
      model: 'claude-opus-4-8',
      ignore: ['tests/fixtures/**'],
      checks: { scope: false },
    });
  });

  it('throws ConfigError on invalid JSON', () => {
    writeFileSync(path.join(cwd, '.vouch.json'), '{ not json');
    expect(() => loadProjectConfig(cwd)).toThrow(ConfigError);
  });

  it('throws ConfigError on an unknown key (strict — catches typos)', () => {
    writeFileSync(path.join(cwd, '.vouch.json'), JSON.stringify({ ignored: ['x'] }));
    expect(() => loadProjectConfig(cwd)).toThrow(/ignored/);
  });

  it('throws ConfigError on a wrong-typed field', () => {
    writeFileSync(path.join(cwd, '.vouch.json'), JSON.stringify({ agent: 'yes' }));
    expect(() => loadProjectConfig(cwd)).toThrow(ConfigError);
  });

  it('defaultVouchJson is valid against the schema', () => {
    expect(projectConfigSchema.safeParse(JSON.parse(defaultVouchJson())).success).toBe(true);
  });

  it('tolerates a UTF-8 BOM (Windows editors)', () => {
    writeFileSync(path.join(cwd, '.vouch.json'), '﻿' + JSON.stringify({ agent: false }));
    expect(loadProjectConfig(cwd)).toEqual({ agent: false });
  });
});
