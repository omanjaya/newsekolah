import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import id from "../../../messages/id.json";

/**
 * Keys the attendance screens read whose absence only shows as a console
 * warning and a missing accessible name, so a view test with mocked
 * translations would not catch it.
 */
const REQUIRED_KEYS = {
  mine: ["statsLabel", "legendLabel"],
  schoolToday: ["eyebrow", "dayEyebrow", "dayTitle", "dayBody"],
} as const;

describe("attendance message catalogs", () => {
  for (const [locale, catalog] of [
    ["id", id],
    ["en", en],
  ] as const) {
    it(`carries the student's summary label and the day-aware school card in ${locale}`, () => {
      const attendance = catalog.app.attendance as Record<string, Record<string, unknown>>;
      for (const [section, keys] of Object.entries(REQUIRED_KEYS)) {
        for (const key of keys) {
          expect(attendance[section]?.[key], `${locale}: app.attendance.${section}.${key}`).toEqual(
            expect.any(String),
          );
        }
      }
    });
  }
});
