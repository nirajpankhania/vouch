// Helpers shared by checks. Found by dogfooding (docs/CAUGHT.md #1): without
// a file-type gate, placeholders/tests flagged .diff fixtures and prose.

/**
 * Files whose content is prose or data, not executable code — a TODO in a
 * markdown doc or a committed .diff fixture is not a stub.
 */
const NON_CODE = /\.(diff|patch|md|markdown|rst|txt|csv|lock|svg)$|(^|\/)[^/]*lock\.(json|yaml)$/i;

export function isCodeFile(gitPath: string): boolean {
  return !NON_CODE.test(gitPath);
}
