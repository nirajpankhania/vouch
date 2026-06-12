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
 * Pre-loaded project state so checks stay I/O-free.
 * Phase 2 adds the shared ts-morph Project here.
 */
export interface ProjectAccess {
  /**
   * Contents of files touched by the diff (post-change side), keyed by
   * git-normalized path. Deleted/binary files are absent.
   */
  files: ReadonlyMap<string, string>;
}

export interface CheckContext {
  hunks: Hunk[];
  task: TaskInfo;
  project: ProjectAccess;
}

export type Severity = 'error' | 'warn' | 'info';

export type Confidence = 'high' | 'medium' | 'low';

export interface Finding {
  /** Name of the check that produced this finding. */
  check: string;
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
