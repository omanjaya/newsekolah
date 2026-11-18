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
});
