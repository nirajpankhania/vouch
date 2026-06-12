// Registry of all deterministic checks. The pipeline runs every entry;
// a check that throws is a tool bug (exit 2 territory), never swallowed.
import { placeholders } from './placeholders.js';
import type { Check } from './types.js';

export const allChecks: readonly Check[] = [placeholders];
