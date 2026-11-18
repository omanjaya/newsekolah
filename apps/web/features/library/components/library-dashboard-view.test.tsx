import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const viewport = vi.hoisted(() => ({ desktop: false }));

import { LibraryDashboardView } from "./library-dashboard-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../components/use-is-desktop", () => ({
  useIsDesktop: () => viewport.desktop,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("./dashboard-series-chart", () => ({
  DashboardSeriesChart: () => <div data-testid="series-chart" />,
}));
vi.mock("./dashboard-activity-lists", () => ({
  DashboardActivityLists: () => <div data-testid="activity-lists" />,
}));
vi.mock("../dashboard-api", () => ({
  useLibraryDashboardQuery: () => ({
    data: {
      summary: {
        loans_today: 2,
        returns_today: 1,
        overdue: 0,
        visits_today: 5,
        titles: 120,
        copies: 300,
        available: 250,
        on_loan: 50,
        members: 400,
        active_members: 80,
        unpaid_fines_total: 0,
      },
      series: [],
      latest_loans: [],
      longest_overdue: [],
      popular_titles: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  viewport.desktop = false;
});

function order(): string[] {
  const marks = [
    screen.getByRole("region", { name: "collectionHeading" }),
    screen.getByTestId("series-chart"),
  ];
  return marks
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((node) => (node.tagName === "SECTION" ? "collection" : "chart"));
}

describe("LibraryDashboardView", () => {
  it("titles the collection figures as a section of their own", () => {
    render(<LibraryDashboardView />);
    expect(screen.getByRole("heading", { name: "collectionHeading" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "collectionHeading" })).toBeInTheDocument();
  });

  it("closes a phone's page with the collection, after the trend", () => {
    render(<LibraryDashboardView />);
    expect(order()).toEqual(["chart", "collection"]);
  });

  it("keeps the collection under today's tiles on a desktop", () => {
    viewport.desktop = true;
    render(<LibraryDashboardView />);
    expect(order()).toEqual(["collection", "chart"]);
  });

  it("marks today's linked strip figures with a chevron on a phone", () => {
    const { container } = render(<LibraryDashboardView />);
    expect(container.querySelectorAll("svg[data-stat-chevron]")).toHaveLength(4);
  });
});
