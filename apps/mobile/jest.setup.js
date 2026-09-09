// Minimal test env shims. Native modules used by the lib layer are mocked
// per-test with jest.mock(); this file only sets globals every test needs.
if (typeof globalThis.fetch === "undefined") {
  globalThis.fetch = jest.fn();
}
