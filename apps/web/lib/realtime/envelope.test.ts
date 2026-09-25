import { describe, expect, it } from "vitest";

import { parseLiveMessage } from "./envelope";

describe("parseLiveMessage", () => {
  it("reads the wrapped Envelope shape (hello, notification_created, subscribed, ...)", () => {
    const raw = JSON.stringify({
      type: "notification_created",
      topic: "user:tenant-1:user-1",
      at: "2026-09-25T00:00:00Z",
      payload: { id: "n1", title: "Izin disetujui" },
    });

    expect(parseLiveMessage(raw)).toEqual({
      type: "notification_created",
      topic: "user:tenant-1:user-1",
      at: "2026-09-25T00:00:00Z",
      payload: { id: "n1", title: "Izin disetujui" },
    });
  });

  it("falls back to the flat shape (classroom_entry_scanned, not yet migrated to PublishEvent)", () => {
    const raw = JSON.stringify({
      type: "classroom_entry_scanned",
      student_name: "Budi",
      nis: "12345",
      class_name: "7A",
      reason: "Izin masuk kelas",
      scanned_at: "2026-09-25T00:00:00Z",
    });

    expect(parseLiveMessage(raw)).toEqual({
      type: "classroom_entry_scanned",
      topic: undefined,
      at: undefined,
      payload: {
        student_name: "Budi",
        nis: "12345",
        class_name: "7A",
        reason: "Izin masuk kelas",
        scanned_at: "2026-09-25T00:00:00Z",
      },
    });
  });

  it("returns null for malformed JSON", () => {
    expect(parseLiveMessage("not json")).toBeNull();
  });

  it("returns null for a JSON value that is not an object", () => {
    expect(parseLiveMessage("42")).toBeNull();
    expect(parseLiveMessage('"a string"')).toBeNull();
    expect(parseLiveMessage("[1,2,3]")).toBeNull();
    expect(parseLiveMessage("null")).toBeNull();
  });

  it("returns null when `type` is missing or not a string", () => {
    expect(parseLiveMessage(JSON.stringify({ payload: {} }))).toBeNull();
    expect(parseLiveMessage(JSON.stringify({ type: 42 }))).toBeNull();
  });
});
