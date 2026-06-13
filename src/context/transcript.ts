// BEST-EFFORT Claude Code transcript reader. The ~/.claude/projects format is
// undocumented and may change between versions, so EVERYTHING here is wrapped:
// any failure returns undefined and the caller falls back to a prompt. This
// module must never throw to the user (CLAUDE.md hard rule).
import { type Dirent, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import path from 'node:path';
import type { TaskInfo } from '../checks/types.js';

// Terse go-aheads that precede the work rather than describe it — judging a
// diff against "approved" is useless, so they're skipped when scanning back
// for the task. Exact-match only: a real short task ("fix login") survives.
const APPROVALS = new Set([
  'y', 'yes', 'yep', 'yeah', 'ok', 'okay', 'sure', 'approve', 'approved',
  'continue', 'go ahead', 'proceed', 'do it', 'lgtm', 'ship it',
]);

/** cwd → project directory name: every non-alphanumeric char becomes '-'. */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

/** Absolute path of the newest .jsonl transcript for cwd, or undefined. */
export function findLatestTranscript(homedir: string, cwd: string): string | undefined {
  const dir = path.join(homedir, '.claude', 'projects', encodeCwd(cwd));
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined; // dir missing/unreadable → no transcript
  }

  let newest: string | undefined;
  let newestMs = -Infinity;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const full = path.join(dir, entry.name);
    try {
      const ms = statSync(full).mtimeMs;
      if (ms > newestMs) {
        newestMs = ms;
        newest = full;
      }
    } catch {
      // unreadable file — skip it, keep scanning
    }
  }
  return newest;
}

/**
 * Latest real user task from transcript text. Version-tolerant: unknown
 * fields ignored, malformed lines skipped, non-task messages (tool results,
 * slash-command wrappers, approvals) filtered out. Pure — testable on strings.
 */
export function extractTaskFromTranscript(jsonl: string): string | undefined {
  let latest: string | undefined;
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // malformed line — tolerate and move on
    }
    const raw = userText(entry);
    if (raw === undefined) continue;
    const cleaned = stripWrappers(raw);
    if (!cleaned) continue; // was pure command/caveat noise
    if (APPROVALS.has(cleaned.toLowerCase())) continue;
    latest = cleaned;
  }
  return latest;
}

/** Top-level entry point: best-effort, never throws. */
export function readTranscriptTask(
  opts: { homedir?: string; cwd?: string } = {},
): TaskInfo | undefined {
  try {
    const home = opts.homedir ?? osHomedir();
    const cwd = opts.cwd ?? process.cwd();
    const file = findLatestTranscript(home, cwd);
    if (!file) return undefined;
    const text = extractTaskFromTranscript(readFileSync(file, 'utf8'));
    return text ? { text, source: 'transcript' } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Text of a human-typed message, or undefined if this entry isn't one.
 * Accepts string content or an array of content blocks, concatenating only
 * `text` blocks — tool_result/tool_use blocks yield no text and are skipped.
 */
function userText(entry: unknown): string | undefined {
  if (!isRecord(entry) || entry['type'] !== 'user') return undefined;
  const message = entry['message'];
  if (!isRecord(message) || message['role'] !== 'user') return undefined;

  const content = message['content'];
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;

  const text = content
    .filter((b): b is { type: 'text'; text: string } => isRecord(b) && b['type'] === 'text' && typeof b['text'] === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return text.length > 0 ? text : undefined;
}

/** Strip slash-command / local-command / system-reminder wrapper blocks. */
function stripWrappers(text: string): string {
  return text
    .replace(/<command-(?:name|message|args)>[\s\S]*?<\/command-(?:name|message|args)>/g, '')
    .replace(/<local-command-(?:stdout|stderr|caveat)>[\s\S]*?<\/local-command-(?:stdout|stderr|caveat)>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
