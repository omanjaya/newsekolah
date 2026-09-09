/** Recursively joins a nested message catalog into dot-separated leaf keys. */
export function flattenMessages(
  source: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result[path] = value;
    } else if (value && typeof value === "object") {
      Object.assign(result, flattenMessages(value as Record<string, unknown>, path));
    }
  }
  return result;
}
