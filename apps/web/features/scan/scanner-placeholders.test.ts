import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import scanEn from "../../messages/features/scan.en.json";
import scanId from "../../messages/features/scan.id.json";
import id from "../../messages/id.json";

/*
 * The Scanner's manual field shares its row with the send button, which
 * leaves it about 170px on a 390px phone: roughly 20 characters of
 * placeholder before it is cut off.
 */
const MAX_PLACEHOLDER = 20;

describe("scanner manual-entry placeholders", () => {
  it.each([
    [
      "id",
      scanId.placeholder,
      id.app.permits.scan.placeholder,
      id.app.permits.classroomEntry.placeholder,
    ],
    [
      "en",
      scanEn.placeholder,
      en.app.permits.scan.placeholder,
      en.app.permits.classroomEntry.placeholder,
    ],
  ])("fit beside the send button on a phone (%s)", (_locale, ...placeholders) => {
    for (const placeholder of placeholders) {
      expect(placeholder.length).toBeLessThanOrEqual(MAX_PLACEHOLDER);
    }
  });
});
