import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LegacyLetterRedirect, legacyLetterTarget } from "./legacy-letter-redirect";

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  session: {
    isReady: true,
    me: undefined as { profile_kind?: string; permissions: string[] } | undefined,
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("../../../lib/session/session-provider", () => ({ useSession: () => state.session }));

describe("legacyLetterTarget", () => {
  it("sends a student to their own discipline page", () => {
    expect(legacyLetterTarget({ profile_kind: "student", permissions: [] })).toBe("/my-discipline");
  });

  it("sends staff who read discipline to the issued letters", () => {
    expect(legacyLetterTarget({ profile_kind: "staff", permissions: ["view_discipline"] })).toBe(
      "/discipline/warning-letters",
    );
  });

  it("falls back to the notifications list for anyone else", () => {
    expect(legacyLetterTarget({ profile_kind: "staff", permissions: [] })).toBe("/notifications");
  });
});

describe("LegacyLetterRedirect", () => {
  beforeEach(() => {
    state.replace.mockReset();
    state.session = { isReady: true, me: undefined };
  });

  it("waits for the session before redirecting", () => {
    state.session = { isReady: false, me: undefined };
    render(<LegacyLetterRedirect />);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("replaces the dead letter URL with the reader's page", async () => {
    state.session = { isReady: true, me: { profile_kind: "student", permissions: [] } };
    render(<LegacyLetterRedirect />);
    await waitFor(() => {
      expect(state.replace).toHaveBeenCalledWith("/my-discipline");
    });
  });
});
