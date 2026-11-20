/** Longest key a criterion gets from its name; the API stores it as a short slug. */
const MAX_KEY_LENGTH = 40;

/**
 * A criterion's scoring key derived from its name ("Membuka pelajaran" →
 * "membuka_pelajaran"), so nobody has to invent a code for every item of
 * an instrument.
 */
export function criterionKeyFrom(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_KEY_LENGTH)
    .replace(/_+$/g, "");
}

/**
 * `base`, or `base_2`, `base_3`... when another criterion already uses it:
 * two criteria named alike ("Penguasaan kelas" twice) get distinct codes
 * instead of one the API refuses. Stays within the key length.
 */
export function uniqueCriterionKey(base: string, taken: ReadonlySet<string>): string {
  if (base === "" || !taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, MAX_KEY_LENGTH - suffix.length).replace(/_+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Whether `key` is still the one derived from `name` (or its numbered
 * variant from `uniqueCriterionKey`), so renaming the criterion may move it.
 */
export function keyFollowsName(key: string, name: string): boolean {
  if (key === "") return true;
  const base = criterionKeyFrom(name);
  if (key === base) return true;
  const match = /^(.+)_(\d+)$/.exec(key);
  if (!match) return false;
  const stem = match[1] ?? "";
  // The stem is the base, or the base cut short to make room for the suffix.
  return stem === base || (key.length >= MAX_KEY_LENGTH - 1 && base.startsWith(stem));
}

/** The trimmed keys more than one criterion uses. */
export function duplicateCriterionKeys(criteria: readonly { key: string }[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { key } of criteria) {
    const trimmed = key.trim();
    if (trimmed === "") continue;
    if (seen.has(trimmed)) duplicates.add(trimmed);
    seen.add(trimmed);
  }
  return duplicates;
}

/**
 * The form two criterion names are compared in: case and spacing do not
 * tell "Penguasaan kelas" from "penguasaan  Kelas" on a scoring form. The
 * API compares the same way (domain.Instrument.ValidateNames).
 */
export function normalizedCriterionName(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).join(" ");
}

/** How many criteria carry each normalized name; a blank name is left out. */
export function criterionNameCounts(criteria: readonly { name: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { name } of criteria) {
    const normalized = normalizedCriterionName(name);
    if (normalized === "") continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return counts;
}

/**
 * The normalized names more than one criterion carries. A repeated name
 * gets a distinct code from `uniqueCriterionKey`, but the observation form
 * and the teacher's report show criteria by name only, so the two rows
 * could not be told apart.
 *
 * `allowed` is the stored instrument's counts (`criterionNameCounts`) when
 * a cycle saved before names had to be unique is edited: a name it already
 * repeated may keep that many copies, or fewer, and is only returned once
 * a copy is added. The API applies the same rule
 * (domain.Instrument.ValidateNames).
 */
export function duplicateCriterionNames(
  criteria: readonly { name: string }[],
  allowed?: ReadonlyMap<string, number>,
): Set<string> {
  const duplicates = new Set<string>();
  for (const [name, count] of criterionNameCounts(criteria)) {
    if (count > 1 && count > (allowed?.get(name) ?? 0)) duplicates.add(name);
  }
  return duplicates;
}
