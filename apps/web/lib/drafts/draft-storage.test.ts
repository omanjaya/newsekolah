import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  discardLegacyDrafts,
  draftKey,
  readDraft,
  removeAllDrafts,
  removeDraftsOf,
  removeDraft,
  writeDraft,
} from "./draft-storage";

const OWNER_A = "school-1:user-a";
const OWNER_B = "school-1:user-b";

const LEGACY_KEYS = [
  "newsekolah:attendance-draft:session-1",
  "newsekolah:counseling-draft:new",
  "newsekolah:journal-draft:class-1:subject-1:2026-09-21",
  "newsekolah:gradebook-draft:class-1:subject-1:term-1",
  "newsekolah:supervision-observation-draft:scheduled-1",
];

function storedKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key !== null) keys.push(key);
  }
  return keys.sort();
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("draft storage", () => {
  it("puts the owner, kind and record in the key", () => {
    expect(draftKey(OWNER_A, "counseling", "new")).toBe(
      "newsekolah:draft:school-1:user-a:counseling:new",
    );
    writeDraft(OWNER_A, "counseling", "new", { text: "x" });
    expect(storedKeys()).toEqual(["newsekolah:draft:school-1:user-a:counseling:new"]);
  });

  it("reads back what the same owner wrote", () => {
    writeDraft(OWNER_A, "journal", "record-1", { text: "x" });
    expect(readDraft(OWNER_A, "journal", "record-1")).toBe(JSON.stringify({ text: "x" }));
  });

  it("does not read one owner's draft for another owner on the same record", () => {
    writeDraft(OWNER_A, "counseling", "new", { text: "x" });
    expect(readDraft(OWNER_B, "counseling", "new")).toBeNull();
    expect(readDraft(`${OWNER_A}~admin-1`, "counseling", "new")).toBeNull();
  });

  it("does not read an administrator's draft, typed while acting as a user, for that user", () => {
    writeDraft(`${OWNER_A}~admin-1`, "counseling", "new", { text: "x" });
    expect(readDraft(OWNER_A, "counseling", "new")).toBeNull();
  });

  it("neither writes nor reads without an owner", () => {
    writeDraft(null, "counseling", "new", { text: "x" });
    expect(storedKeys()).toEqual([]);
    writeDraft(OWNER_A, "counseling", "new", { text: "x" });
    expect(readDraft(null, "counseling", "new")).toBeNull();
  });

  it("removes only the named draft", () => {
    writeDraft(OWNER_A, "counseling", "new", { text: "a" });
    writeDraft(OWNER_B, "counseling", "new", { text: "b" });
    removeDraft(OWNER_A, "counseling", "new");
    expect(readDraft(OWNER_A, "counseling", "new")).toBeNull();
    expect(readDraft(OWNER_B, "counseling", "new")).not.toBeNull();
  });
});

describe("removeAllDrafts", () => {
  it("removes every owner's drafts of every kind and leaves other keys alone", () => {
    writeDraft(OWNER_A, "counseling", "new", { text: "a" });
    writeDraft(OWNER_B, "attendance", "session-1", { text: "b" });
    writeDraft(`${OWNER_A}~admin-1`, "journal", "class-1:subject-1:2026-09-21", { text: "c" });
    window.localStorage.setItem("newsekolah:navigation:school-1:user-a", "{}");
    window.localStorage.setItem("newsekolah:theme", "dark");

    removeAllDrafts();

    expect(storedKeys()).toEqual(["newsekolah:navigation:school-1:user-a", "newsekolah:theme"]);
  });
});

describe("removeDraftsOf", () => {
  it("removes one owner's drafts of every kind and leaves everyone else's alone", () => {
    writeDraft(`${OWNER_A}~admin-1`, "journal", "class-1:subject-1:2026-09-21", { text: "a" });
    writeDraft(`${OWNER_A}~admin-1`, "counseling", "new", { text: "b" });
    writeDraft(OWNER_A, "counseling", "new", { text: "c" });
    writeDraft(OWNER_B, "attendance", "session-1", { text: "d" });
    window.localStorage.setItem("newsekolah:theme", "dark");

    removeDraftsOf(`${OWNER_A}~admin-1`);

    expect(storedKeys()).toEqual([
      `newsekolah:draft:${OWNER_A}:counseling:new`,
      `newsekolah:draft:${OWNER_B}:attendance:session-1`,
      "newsekolah:theme",
    ]);
  });

  it("does nothing without an owner", () => {
    writeDraft(OWNER_A, "counseling", "new", { text: "a" });

    removeDraftsOf(null);

    expect(storedKeys()).toEqual([`newsekolah:draft:${OWNER_A}:counseling:new`]);
  });
});

describe("discardLegacyDrafts", () => {
  it("removes every legacy draft, malformed ones included, and leaves other keys alone", () => {
    for (const key of LEGACY_KEYS) window.localStorage.setItem(key, "{}");
    window.localStorage.setItem("newsekolah:counseling-draft:new:student-1", "not json");
    writeDraft(OWNER_A, "counseling", "new", { text: "a" });
    window.localStorage.setItem("newsekolah:navigation:school-1:user-a", "{}");
    window.localStorage.setItem("newsekolah:theme", "dark");

    discardLegacyDrafts();

    expect(storedKeys()).toEqual([
      "newsekolah:draft:school-1:user-a:counseling:new",
      "newsekolah:navigation:school-1:user-a",
      "newsekolah:theme",
    ]);
  });

  it("does not throw when storage cannot be read", () => {
    window.localStorage.setItem("newsekolah:counseling-draft:new", "{}");
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => {
      discardLegacyDrafts();
    }).not.toThrow();
  });

  it("does not throw when a removal fails", () => {
    for (const key of LEGACY_KEYS) window.localStorage.setItem(key, "{}");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => {
      discardLegacyDrafts();
    }).not.toThrow();
  });
});
