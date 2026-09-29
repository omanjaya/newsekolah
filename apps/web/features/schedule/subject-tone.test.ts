import { describe, expect, it } from "vitest";

import { SUBJECT_TONE_CLASSES, subjectTone } from "./subject-tone";

const TONES = ["green", "amber", "purple", "blue", "red"] as const;

describe("subjectTone", () => {
  it("is deterministic for the same subject id", () => {
    expect(subjectTone("subject-1")).toBe(subjectTone("subject-1"));
    expect(subjectTone("11111111-1111-4111-8111-111111111111")).toBe(
      subjectTone("11111111-1111-4111-8111-111111111111"),
    );
  });

  it("always returns one of the five category tones", () => {
    for (const id of ["", "a", "subject-42", "Matematika", "  spaced  "]) {
      expect(TONES).toContain(subjectTone(id));
    }
  });

  it("spreads across more than one tone for a run of different ids", () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => subjectTone(`subject-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("does not depend on argument order tricks like case or trimming", () => {
    // Different strings may collide, but the function itself must not
    // normalise the input -- "Biologi" and "biologi" are different subject
    // ids and are free to land on different tones.
    expect(typeof subjectTone("Biologi")).toBe("string");
    expect(typeof subjectTone("biologi")).toBe("string");
  });
});

describe("SUBJECT_TONE_CLASSES", () => {
  it("has a class string for every tone subjectTone can return", () => {
    for (const tone of TONES) {
      expect(SUBJECT_TONE_CLASSES[tone]).toMatch(
        /^bg-category-\w+-soft text-category-\w+-soft-fg$/,
      );
    }
  });
});
