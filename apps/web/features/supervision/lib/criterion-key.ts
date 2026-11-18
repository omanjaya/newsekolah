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
