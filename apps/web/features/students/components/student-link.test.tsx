import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  me: undefined as { permissions: string[]; profile_kind?: string } | undefined,
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: mocks.me }),
}));

import { StudentLink } from "./student-link";

describe("StudentLink", () => {
  beforeEach(() => {
    mocks.me = undefined;
  });

  it("links to the profile when the reader holds a tab permission", () => {
    mocks.me = { permissions: ["view_discipline"], profile_kind: "staff" };
    render(<StudentLink studentId="s-1">Ani</StudentLink>);
    expect(screen.getByRole("link", { name: "Ani" }).getAttribute("href")).toBe("/students/s-1");
  });

  it("deep-links to a tab", () => {
    mocks.me = { permissions: ["view_discipline"], profile_kind: "teacher" };
    render(
      <StudentLink studentId="s-1" tab="discipline">
        Ani
      </StudentLink>,
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("/students/s-1?tab=discipline");
  });

  it("renders plain text without any profile permission", () => {
    mocks.me = { permissions: ["view_schedules"], profile_kind: "staff" };
    render(<StudentLink studentId="s-1">Ani</StudentLink>);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Ani")).toBeTruthy();
  });

  it("renders plain text for a student reader", () => {
    mocks.me = { permissions: ["view_discipline"], profile_kind: "student" };
    render(<StudentLink studentId="s-1">Ani</StudentLink>);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders plain text while the session loads", () => {
    render(<StudentLink studentId="s-1">Ani</StudentLink>);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders plain text without a student id", () => {
    mocks.me = { permissions: ["view_discipline"], profile_kind: "staff" };
    render(<StudentLink studentId={undefined}>Budi</StudentLink>);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
