/**
 * Bridges a form that keeps a number as the text typed (so an empty field
 * stays empty) and the shared NumberInput, which speaks `number | null`.
 */
export function fromText(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isNaN(value) ? null : value;
}

/** The text a form keeps for a NumberInput's value; empty while there is none. */
export function toText(value: number | null): string {
  return value === null ? "" : String(value);
}
