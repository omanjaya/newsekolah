import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HomeroomDashboard } from "./homeroom-dashboard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTimeRange: () => "" }),
}));

describe("HomeroomDashboard", () => {
  it("gives the contact card its own empty line and ends the cards at one height", () => {
    render(
      <HomeroomDashboard
        attentionRows={[]}
        disciplineRows={[]}
        pendingLeave={[]}
        dashboardLoading={false}
        leaveLoading={false}
        showLeave
        showDiscipline
      />,
    );

    // The hero above already says every student is recorded; the card does
    // not repeat it word for word.
    expect(screen.getByText("contactEmpty")).toBeInTheDocument();
    expect(screen.queryByText("attentionEmpty")).not.toBeInTheDocument();

    const cards = ["attentionListTitle", "pendingLeaveTitle", "disciplineTitle"].map((title) =>
      screen.getByRole("heading", { name: title }).closest("[data-slot=card]"),
    );
    for (const card of cards) expect(card).toHaveClass("h-full");
    expect(cards[0]?.parentElement).not.toHaveClass("items-start");
  });

  it("shows the failed reads in their cards instead of a green all-clear", () => {
    const failure = { error: new Error("500"), retry: vi.fn() };
    render(
      <HomeroomDashboard
        attentionRows={[]}
        disciplineRows={[]}
        pendingLeave={[]}
        dashboardLoading={false}
        leaveLoading={false}
        dashboardFailure={failure}
        leaveFailure={failure}
        showLeave
        showDiscipline
      />,
    );

    expect(screen.getAllByRole("alert")).toHaveLength(3);
    for (const empty of ["contactEmpty", "pendingLeaveEmpty", "disciplineEmpty"]) {
      expect(screen.queryByText(empty)).not.toBeInTheDocument();
    }
  });

  it("gives the waiting cards the accent count and the discipline tally the neutral one", () => {
    const entry = (id: string, status: string, violations = 0) =>
      ({
        student_user_id: id,
        name: id,
        status_code: status,
        violation_count: violations,
        violation_points: violations * 5,
      }) as Parameters<typeof HomeroomDashboard>[0]["attentionRows"][number];
    render(
      <HomeroomDashboard
        attentionRows={[entry("a1", "A"), entry("a2", "A")]}
        disciplineRows={[entry("d1", "H", 1), entry("d2", "H", 2), entry("d3", "H", 1)]}
        pendingLeave={[]}
        dashboardLoading={false}
        leaveLoading={false}
        showLeave
        showDiscipline
      />,
    );

    const count = (title: string) =>
      screen.getByRole("heading", { name: new RegExp(`^${title}`) }).querySelector("span");
    expect(count("attentionListTitle")).toHaveClass("bg-accent");
    expect(count("disciplineTitle")).toHaveClass("bg-neutral-soft");
  });
});
