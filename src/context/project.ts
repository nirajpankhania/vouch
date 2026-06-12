// Builds ProjectAccess: the one place ts-morph Project construction and
// node_modules scanning happen. Checks receive the result and stay pure.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ModuleKind, ModuleResolutionKind, Project, type SourceFile } from 'ts-morph';
import type { Hunk, ProjectAccess } from '../checks/types.js';

const TS_FILE = /\.[cm]?tsx?$/;

export function buildProjectAccess(hunks: Hunk[], cwd: string = process.cwd()): ProjectAccess {
  const touched = uniqueLiveFiles(hunks);
  const files = readContents(touched, cwd);
  const tsPaths = touched.filter((p) => TS_FILE.test(p));
  if (tsPaths.length === 0) {
    return { files };
  }
  return {
    files,
    tsFiles: loadTsFiles(tsPaths, cwd),
    installedPackages: scanInstalledPackages(cwd),
  };
}

/** Post-change paths that still exist conceptually (not deleted/binary). */
function uniqueLiveFiles(hunks: Hunk[]): string[] {
  const seen = new Set<string>();
  for (const hunk of hunks) {
    if (hunk.status === 'deleted' || hunk.status === 'binary') continue;
    seen.add(hunk.file);
  }
  return [...seen];
}

function readContents(gitPaths: string[], cwd: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const gitPath of gitPaths) {
    try {
      map.set(gitPath, readFileSync(toFsPath(cwd, gitPath), 'utf8'));
    } catch {
      // File listed in the diff but unreadable on disk (e.g. staged delete
      // of the working copy) — simply absent from the map.
    }
  }
  return map;
}

function loadTsFiles(gitPaths: string[], cwd: string): ReadonlyMap<string, SourceFile> {
  const tsConfigFilePath = path.join(cwd, 'tsconfig.json');
  const project = existsSync(tsConfigFilePath)
    ? new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: true })
    : // No tsconfig in the target repo: Bundler resolution is the forgiving
      // default — extensionless relative imports and node_modules both work.
      new Project({
        compilerOptions: {
          allowJs: true,
          module: ModuleKind.ESNext,
          moduleResolution: ModuleResolutionKind.Bundler,
        },
      });

  const map = new Map<string, SourceFile>();
  for (const gitPath of gitPaths) {
    try {
      const source = project.addSourceFileAtPathIfExists(toFsPath(cwd, gitPath));
      if (source) map.set(gitPath, source);
    } catch {
      // A parse failure in one file must not abort the others; the imports
      // check treats a missing entry as "could not analyze".
    }
  }
  try {
    // Pull in the dependency closure of the touched files so
    // getModuleSpecifierSourceFile() can resolve project-internal imports.
    project.resolveSourceFileDependencies();
  } catch {
    // Resolution failures degrade to "unresolved" findings, never a crash.
  }
  return map;
}

/** Walk up from cwd collecting node_modules entries, like node resolution. */
function scanInstalledPackages(cwd: string): ReadonlySet<string> {
  const packages = new Set<string>();
  let dir = path.resolve(cwd);
  for (;;) {
    const nm = path.join(dir, 'node_modules');
    if (existsSync(nm)) {
      for (const entry of safeReaddir(nm)) {
        if (entry.startsWith('.')) continue;
        if (entry.startsWith('@')) {
          for (const scoped of safeReaddir(path.join(nm, entry))) {
            packages.add(`${entry}/${scoped}`);
          }
        } else {
          packages.add(entry);
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return packages;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function toFsPath(cwd: string, gitPath: string): string {
  return path.join(cwd, ...gitPath.split('/'));
}
