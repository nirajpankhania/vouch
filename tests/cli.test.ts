import { describe, expect, it } from 'vitest';
import { buildProgram, EXIT } from '../src/cli.js';

describe('cli skeleton', () => {
  it('exposes a check command', () => {
    const program = buildProgram();
    const check = program.commands.find((c) => c.name() === 'check');
    expect(check).toBeDefined();
  });

  it('check has the frozen v1 flags from docs/SPEC.md', () => {
    const program = buildProgram();
    const check = program.commands.find((c) => c.name() === 'check');
    const flags = check?.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining(['--message', '--staged', '--base', '--json', '--no-agent', '--model']),
    );
  });

  it('exit codes match the API contract', () => {
    expect(EXIT).toEqual({ clean: 0, findings: 1, toolError: 2 });
  });
});
