/** `edits[componentId][studentId] = draft score`, the source of truth for what gets submitted. */
export type Edits = Record<string, Record<string, string>>;
