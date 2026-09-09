import { describe, expect, it } from "vitest";

import { base } from "./base.js";
import { next } from "./next.js";
import { react } from "./react.js";

describe("shared eslint configs", () => {
  it("base exports a non-empty flat config array", () => {
    expect(Array.isArray(base)).toBe(true);
    expect(base.length).toBeGreaterThan(0);
  });

  it("react extends base and adds jsx-a11y", () => {
    expect(react.length).toBeGreaterThan(base.length);
  });

  it("next extends react", () => {
    expect(next.length).toBeGreaterThanOrEqual(react.length);
  });
});
