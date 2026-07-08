import type { SourceFile } from 'ts-morph';

// Single source of truth for the deterministic-check contract.
// Checks are PURE and SYNCHRONOUS: all file reads, git calls, and (Phase 2)
// ts-morph Project construction happen once in context/ and arrive here via
// CheckContext. If a check "needs" I/O, extend CheckContext instead.

/** How a file changed in the diff. */
export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'binary';

/** One line inside a hunk, prefix stripped. */
export interface HunkLine {
  kind: 'add' | 'del' | 'context';
  /** Line content without the leading +/-/space. */
  text: string;
  /** Line number in the old file (absent for pure additions). */
  oldLine?: number;
  /** Line number in the new file (absent for pure deletions). */
  newLine?: number;
}

/**
 * One contiguous change region. Our own shape, deliberately decoupled from
 * parse-diff's types so checks never depend on the diff library.
 * Paths always use '/' (git-normalized); context/ owns conversion to
 * filesystem paths when reading from disk.
 */
export interface Hunk {
  /** Path after the change (new path for renames). */
  file: string;
  /** Path before the change; differs from `file` only on rename. */
  oldFile: string | null;
  status: FileStatus;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Empty for binary files (status 'binary'). */
  lines: HunkLine[];
}

/** Where the task text came from — surfaced in all output (docs/SPEC.md). */
export type TaskSource = 'flag' | 'taskfile' | 'transcript' | 'prompt';

export interface TaskInfo {
  text: string;
  source: TaskSource;
}

/**
 * Pre-loaded project state so checks stay I/O-free. Built once in
 * context/project.ts; ts-morph construction is the expensive part.
 */
export interface ProjectAccess {
  /**
   * Contents of files touched by the diff (post-change side), keyed by
   * git-normalized path. Deleted/binary files are absent.
   */
  files: ReadonlyMap<string, string>;
  /**
   * ts-morph SourceFiles for diff-touched .ts/.tsx files, keyed by
   * git-normalized path. Absent when no TS files were touched.
   */
  tsFiles?: ReadonlyMap<string, SourceFile>;
  /**
   * Top-level package names present in node_modules (walking up from the
   * repo root, mirroring node resolution). Fallback for packages that are
   * installed but ship no types.
   */
  installedPackages?: ReadonlySet<string>;
}

export interface CheckContext {
  hunks: Hunk[];
  task: TaskInfo;
  project: ProjectAccess;
}

export type Severity = 'error' | 'warn' | 'info';

export type Confidence = 'high' | 'medium' | 'low';

/**
 * Stable issue codes for the deterministic layer. Codes are API (docs/SPEC.md):
 * renaming or removing one is a breaking change, same as exit codes. A runtime
 * array (not just a type) so `vouch list-codes` and per-code config validation
 * can enumerate them.
 */
export const DETERMINISTIC_ISSUE_CODES = [
  'placeholder-code',
  'test-tampering',
  'unresolved-import',
  'scope-drift',
] as const;

/**
 * Union of all stable issue codes. Grows with the curated agentic taxonomy
 * (8 codes, docs/PLAN.md Phase 6) when the agent layer adopts codes.
 */
export type IssueCode = (typeof DETERMINISTIC_ISSUE_CODES)[number];

export interface Finding {
  /** Name of the check that produced this finding (internal, may change). */
  check: string;
  /** Stable issue code — the API-facing category (docs/SPEC.md). */
  code: IssueCode;
  /** error: objectively wrong · warn: human should look · info: heuristic. */
  severity: Severity;
  file: string;
  line?: number;
  message: string;
  /** Heuristic checks (e.g. scope) must always report 'low'. */
  confidence: Confidence;
}

export type Check = {
  name: string;
  run: (ctx: CheckContext) => Finding[];
};
