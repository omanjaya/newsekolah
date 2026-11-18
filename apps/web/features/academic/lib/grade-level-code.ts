/**
 * Whether a grade level's code only repeats its name ("X" in "Kelas X",
 * "1" in "Kelas 1"), so a phone card can leave the code line out.
 */
export function codeRepeatsName(code: string, name: string): boolean {
  const needle = code.trim().toLowerCase();
  if (!needle) return true;
  return name.toLowerCase().split(/\s+/).includes(needle);
}
