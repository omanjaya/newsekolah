import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  managesGroups: false,
  meId: "counselor-1",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  // Every reader here carries manage_mentoring from the teacher role; only
  // manage_mentor_groups (or being the group's mentor) opens writing.
  useCan: (permission: string) =>
    permission === "manage_mentor_groups" ? mocks.managesGroups : permission === "manage_mentoring",
  useSession: () => ({ me: { id: mocks.meId } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1" }),
}));
vi.mock("../../../lib/api/client", () => ({
  useApiClient: () => ({}),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { data: [{ id: "term-1", name: "Ganjil", is_active: true }] } }),
}));
vi.mock("../api", () => ({
  useMentorTermSummaryQuery: () => ({
    data: { summary: "Rajin dan aktif." },
    isLoading: false,
    error: null,
  }),
  useWriteMentorTermSummaryMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { MentorTermSummaryPanel } from "./mentor-term-summary-panel";

describe("MentorTermSummaryPanel", () => {
  beforeEach(() => {
    mocks.managesGroups = false;
    mocks.meId = "counselor-1";
  });

  it("gives a counselor who is not the group's mentor a read-only summary", () => {
    render(<MentorTermSummaryPanel groupId="g1" studentId="s1" mentorUserId="mentor-1" />);

    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveValue("Rajin dan aktif.");
    expect(screen.queryByRole("button", { name: "submit" })).not.toBeInTheDocument();
  });

  it("keeps the summary read-only while the group, and so its mentor, is still loading", () => {
    mocks.meId = "mentor-1";
    render(<MentorTermSummaryPanel groupId="g1" studentId="s1" mentorUserId={undefined} />);

    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "submit" })).not.toBeInTheDocument();
  });

  it("lets the group's mentor write the summary", () => {
    mocks.meId = "mentor-1";
    render(<MentorTermSummaryPanel groupId="g1" studentId="s1" mentorUserId="mentor-1" />);

    expect(screen.getByRole("textbox")).toBeEnabled();
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
  });

  it("lets a group manager write the summary in another mentor's group", () => {
    mocks.managesGroups = true;
    mocks.meId = "admin-1";
    render(<MentorTermSummaryPanel groupId="g1" studentId="s1" mentorUserId="mentor-1" />);

    expect(screen.getByRole("textbox")).toBeEnabled();
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
  });
});
