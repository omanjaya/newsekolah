import { describe, expect, it } from "vitest";

import { telHref, whatsAppHref } from "./guardian-contact";

describe("telHref", () => {
  it("strips formatting characters", () => {
    expect(telHref("0812-3456-7890")).toBe("tel:081234567890");
  });

  it("keeps a leading + for an already-international number", () => {
    expect(telHref("+62 812 3456 7890")).toBe("tel:+6281234567890");
  });
});

describe("whatsAppHref", () => {
  it("replaces a leading domestic 0 with the 62 country code", () => {
    expect(whatsAppHref("0812-3456-7890")).toBe("https://wa.me/6281234567890");
  });

  it("leaves an already-international number as-is", () => {
    expect(whatsAppHref("+62 812 3456 7890")).toBe("https://wa.me/6281234567890");
  });

  it("does not touch a number with no leading 0", () => {
    expect(whatsAppHref("81234567890")).toBe("https://wa.me/81234567890");
  });
});
