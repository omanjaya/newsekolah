/**
 * Filter groups for the public catalogue, read from the catalogue itself.
 * A school's classification is free text with its broad group first
 * ("Fiksi - Novel Indonesia", "Non-Fiksi - Sejarah"), and the OPAC search
 * filters on a prefix of it (`classification_prefix`), so each distinct
 * first segment is one filter. Groups are ordered by how many titles they
 * hold, then by name, and capped so the row of pills stays short.
 */
export function classificationGroups(
  titles: readonly { classification: string }[],
  max = 6,
): string[] {
  const counts = new Map<string, number>();
  for (const { classification } of titles) {
    const group = classificationGroup(classification);
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
    .slice(0, max)
    .map(([group]) => group);
}

/** "Fiksi - Novel Indonesia" -> "Fiksi"; an unsplit value is its own group. */
export function classificationGroup(classification: string): string {
  return classification.split(/\s+[-–]\s+/)[0]?.trim() ?? "";
}
