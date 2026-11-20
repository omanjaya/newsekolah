import { sessionAccess } from "@/lib/attendance/session-access";

describe("sessionAccess", () => {
  it("opens a lesson handed to a substitute read-only for its own teacher", () => {
    // What POST open returns to the original teacher once a substitute took
    // the lesson: correction save_mode, but no window to save in.
    expect(sessionAccess({ handed_over_to_user_id: "substitute", save_mode: "correction" })).toBe(
      "read_only",
    );
  });

  it("lets a homeroom teacher correct a handed-over lesson within the window", () => {
    expect(
      sessionAccess({
        handed_over_to_user_id: "substitute",
        save_mode: "correction",
        editable_until: "2027-01-11T16:59:59Z",
      }),
    ).toBe("correction");
  });

  it("follows save_mode otherwise", () => {
    expect(sessionAccess({ save_mode: "normal", submitted_at: "2027-01-11T01:00:00Z" })).toBe(
      "normal",
    );
    expect(sessionAccess({ save_mode: "correction" })).toBe("correction");
  });

  it("falls back to the submitted state for an API without save_mode", () => {
    expect(sessionAccess({})).toBe("normal");
    expect(sessionAccess({ submitted_at: "2027-01-11T01:00:00Z" })).toBe("correction");
  });
});
