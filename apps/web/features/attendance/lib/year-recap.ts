interface RecapStatus {
  code: string;
  label: string;
  counts_as_present: boolean;
}

export interface YearRecapPart {
  code: string;
  label: string;
  count: number;
}

/**
 * The non-zero exception-status parts for a student's running academic-year
 * recap, replacing the old always-every-status dot row ("S1 I0 D0 A0")
 * with only what is actually worth reading: present itself is never a
 * recap topic, and a status nobody has this year does not deserve a line.
 * The caller renders a neutral phrase instead when this comes back empty
 * but `yearCounts` was given (a clean-slate year, not missing data).
 */
export function yearRecapParts(
  statuses: readonly RecapStatus[],
  yearCounts: Record<string, number> | undefined,
): YearRecapPart[] {
  if (!yearCounts) return [];
  const parts: YearRecapPart[] = [];
  for (const status of statuses) {
    if (status.counts_as_present) continue;
    const count = yearCounts[status.code] ?? 0;
    if (count > 0) parts.push({ code: status.code, label: status.label, count });
  }
  return parts;
}
