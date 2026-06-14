// The agent's read-only toolset. A verifier that mutates the repo is a
// contradiction (product principle, not just safety) — every tool here only
// reads. executeTool NEVER throws: all failures become "ERROR: ..." strings so
// a bad call costs one turn, not the whole run (agent-loop skill).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { z } from 'zod';

/** Anthropic tool definition shape — structurally matches the SDK's Tool. */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentToolContext {
  /** Repo root; every path input is jailed to this directory. */
  cwd: string;
}

const MAX_FILE_LINES = 200;
const MAX_DIR_ENTRIES = 200;
const MAX_SEARCH_LINES = 50;

export const toolDefs: readonly ToolDef[] = [
  {
    name: 'read_file',
    description:
      'Read a file from the repository to see the context around a hunk. ' +
      `Returns up to ${MAX_FILE_LINES} numbered lines. Optionally pass a 1-based line range.`,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relative file path (forward slashes).' },
        start_line: { type: 'number', description: '1-based first line (optional).' },
        end_line: { type: 'number', description: '1-based last line, inclusive (optional).' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_git_log',
    description:
      "Recent commit history of a file — was this churn normal? Returns up to 10 commits.",
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relative file path.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_dir',
    description: 'List the entries of a directory to orient in the repo structure.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relative directory path. Defaults to repo root.' },
      },
    },
  },
  {
    name: 'search',
    description:
      'Search tracked files for a pattern (git grep) — e.g. to check whether a ' +
      `function is actually used. Returns up to ${MAX_SEARCH_LINES} matching lines.`,
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text or basic regex to search for.' },
      },
      required: ['pattern'],
    },
  },
];

const readFileInput = z.object({
  path: z.string(),
  start_line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional(),
});
const pathInput = z.object({ path: z.string() });
const listDirInput = z.object({ path: z.string().optional() });
const searchInput = z.object({ pattern: z.string() });

export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: AgentToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'read_file':
        return readFile(readFileInput.parse(rawInput), ctx);
      case 'read_git_log':
        return await readGitLog(pathInput.parse(rawInput), ctx);
      case 'list_dir':
        return listDir(listDirInput.parse(rawInput), ctx);
      case 'search':
        return await search(searchInput.parse(rawInput), ctx);
      default:
        return `ERROR: unknown tool: ${name}`;
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return `ERROR: invalid input for ${name}: ${err.issues.map((i) => i.message).join('; ')}`;
    }
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Resolve a repo-relative path, or null if it escapes the repo root. */
function resolveInRepo(cwd: string, p: string): string | null {
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, p);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function readFile(input: z.infer<typeof readFileInput>, ctx: AgentToolContext): string {
  const resolved = resolveInRepo(ctx.cwd, input.path);
  if (!resolved) return `ERROR: path escapes repository root: ${input.path}`;

  const text = readFileSync(resolved, 'utf8'); // throws ENOENT → caught as ERROR
  const lines = text.split('\n');
  const start = input.start_line ?? 1;
  const end = Math.min(input.end_line ?? start + MAX_FILE_LINES - 1, start + MAX_FILE_LINES - 1);
  const slice = lines.slice(start - 1, end);
  if (slice.length === 0) return `(no lines in range ${start}-${end}; file has ${lines.length} lines)`;
  return slice.map((line, i) => `${start + i}\t${line}`).join('\n');
}

async function readGitLog(input: z.infer<typeof pathInput>, ctx: AgentToolContext): Promise<string> {
  const resolved = resolveInRepo(ctx.cwd, input.path);
  if (!resolved) return `ERROR: path escapes repository root: ${input.path}`;

  const log = await simpleGit(ctx.cwd).log({ file: input.path, maxCount: 10 });
  if (log.all.length === 0) return `(no commit history for ${input.path})`;
  return log.all
    .map((c) => `${c.hash.slice(0, 8)} ${c.date.slice(0, 10)} ${c.message}`)
    .join('\n');
}

function listDir(input: z.infer<typeof listDirInput>, ctx: AgentToolContext): string {
  const resolved = resolveInRepo(ctx.cwd, input.path ?? '.');
  if (!resolved) return `ERROR: path escapes repository root: ${input.path ?? '.'}`;

  if (!statSync(resolved).isDirectory()) return `ERROR: not a directory: ${input.path ?? '.'}`;
  const entries = readdirSync(resolved, { withFileTypes: true })
    .slice(0, MAX_DIR_ENTRIES)
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  return entries.length > 0 ? entries.join('\n') : '(empty directory)';
}

async function search(input: z.infer<typeof searchInput>, ctx: AgentToolContext): Promise<string> {
  try {
    const out = await simpleGit(ctx.cwd).raw(['grep', '-n', '-I', '-e', input.pattern]);
    const lines = out.split('\n').filter((l) => l.length > 0);
    // git grep exits 1 with no output on no match; some platforms resolve
    // rather than throw, so handle the empty result here as well as in catch.
    if (lines.length === 0) return `(no matches for: ${input.pattern})`;
    const shown = lines.slice(0, MAX_SEARCH_LINES).join('\n');
    return lines.length > MAX_SEARCH_LINES
      ? `${shown}\n… (${lines.length - MAX_SEARCH_LINES} more matches)`
      : shown;
  } catch {
    // git grep exits non-zero when there are no matches — not an error here.
    return `(no matches for: ${input.pattern})`;
  }
}
