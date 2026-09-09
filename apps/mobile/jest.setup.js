// Minimal test env shims. Native modules used by the lib layer are mocked
// per-test with jest.mock(); this file only sets globals every test needs.
if (typeof globalThis.fetch === "undefined") {
  globalThis.fetch = jest.fn();
}

// intl-messageformat (a dependency of @newsekolah/i18n, pulled in via
// src/i18n/t.ts) ships a compiled class-static-block that
// babel-preset-expo's Jest transform does not support (Jest runs under
// plain Node, not through Metro's bundler, where this is a non-issue). None
// of this app's Jest tests assert on translated copy -- that is
// @newsekolah/i18n's own responsibility (packages/i18n/src/translator.test.ts,
// run under Vitest, which handles the real ESM package natively) -- so a
// small stand-in with the same shape is enough here.
jest.mock("intl-messageformat", () => ({
  IntlMessageFormat: class FakeIntlMessageFormat {
    constructor(pattern) {
      this.pattern = pattern;
    }
    format(values) {
      if (!values) return this.pattern;
      return this.pattern.replace(/\{(\w+)[^}]*\}/g, (_match, key) => String(values[key] ?? ""));
    }
  },
}));
