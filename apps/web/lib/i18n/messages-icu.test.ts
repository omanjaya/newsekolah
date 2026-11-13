import { createTranslator, IntlErrorCode } from "next-intl";
import { describe, expect, it } from "vitest";

import "../../messages/features";

import { getMessages } from "./get-messages";

// Known offenders owned by another area, tracked as a handoff: their
// placeholder examples use `{{x}}` without ICU escaping, so next-intl falls
// back to showing the raw key. Remove an entry once that catalog is fixed.
const KNOWN_INVALID_PREFIXES = ["app.discipline."];

function collectLeaves(value: unknown, path: string[], out: [string, string][]): void {
  if (typeof value === "string") {
    out.push([path.join("."), value]);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) collectLeaves(child, [...path, key], out);
}

describe.each(["id", "en"] as const)("%s catalog", (locale) => {
  it("contains only valid ICU messages", () => {
    const messages = getMessages(locale);
    const leaves: [string, string][] = [];
    collectLeaves(messages, [], leaves);

    const invalid: string[] = [];
    let current = "";
    const translator = createTranslator({
      locale,
      messages: messages as never,
      onError: (error) => {
        if (error.code === IntlErrorCode.INVALID_MESSAGE) invalid.push(current);
      },
    });
    for (const [key] of leaves) {
      current = key;
      try {
        (translator as unknown as (k: string) => string)(key);
      } catch {
        // Formatting failures other than syntax (missing arguments) are fine here.
      }
    }

    const unexpected = invalid.filter(
      (key) => !KNOWN_INVALID_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    expect(unexpected).toEqual([]);
  });
});
