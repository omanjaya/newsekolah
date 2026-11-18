import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { draftOwnerOf, useDraftOwner, type DraftOwnerSource } from "./draft-owner";

const session = vi.hoisted((): { me: unknown } => ({ me: undefined }));

vi.mock("../session/session-provider", () => ({
  useSession: () => ({ me: session.me }),
}));

const teacher: DraftOwnerSource = { id: "teacher-1", tenant: { tenant_id: "school-1" } };

describe("draftOwnerOf", () => {
  it("is the tenant and user for a plain session", () => {
    expect(draftOwnerOf(teacher)).toBe("school-1:teacher-1");
  });

  it("adds the acting administrator during impersonation", () => {
    expect(
      draftOwnerOf({ ...teacher, impersonated_by: { user_id: "admin-1", name: "Admin" } }),
    ).toBe("school-1:teacher-1~admin-1");
  });

  it("is null when an administrator is acting but not named", () => {
    expect(draftOwnerOf({ ...teacher, impersonated_by: { name: "Admin" } })).toBeNull();
  });

  it("is null without a session", () => {
    expect(draftOwnerOf(undefined)).toBeNull();
  });
});

describe("useDraftOwner", () => {
  it("is null until the session is known, then the owner", () => {
    session.me = undefined;
    const { result, rerender } = renderHook(() => useDraftOwner());
    expect(result.current).toBeNull();

    session.me = teacher;
    rerender();
    expect(result.current).toBe("school-1:teacher-1");
  });

  it("is null while a different account is signed in under an open form", () => {
    session.me = teacher;
    const { result, rerender } = renderHook(() => useDraftOwner());
    expect(result.current).toBe("school-1:teacher-1");

    session.me = { id: "teacher-2", tenant: { tenant_id: "school-1" } };
    rerender();
    expect(result.current).toBeNull();

    session.me = teacher;
    rerender();
    expect(result.current).toBe("school-1:teacher-1");
  });
});
