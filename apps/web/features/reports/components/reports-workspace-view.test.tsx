import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("../../../lib/session/session-provider", () => ({ useSession: () => ({ me: session }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../components/forbidden-page", () => ({ ForbiddenPage: () => <p>Forbidden</p> }));
vi.mock("next/dynamic", async () => {
  const { lazy } = await import("react");
  return {
    default: (loader: () => Promise<ComponentType<{ tabKey?: string }>>) =>
      lazy(async () => ({ default: await loader() })),
  };
});
vi.mock("./reports-view", () => ({
  ReportsView: ({ tabKey }: { tabKey: string }) => <p data-testid="school-report">{tabKey}</p>,
}));
vi.mock("../../library/components/library-reports-view", () => ({
  LibraryReportsView: ({ tabKey }: { tabKey: string }) => (
    <p data-testid="library-report">{tabKey}</p>
  ),
}));
vi.mock("../../visitors/components/visitor-recap-view", () => ({
  VisitorRecapView: ({ tabKey }: { tabKey: string }) => (
    <p data-testid="visitor-report">{tabKey}</p>
  ),
}));

import { ReportsWorkspaceView } from "./reports-workspace-view";

describe("reports workspace permission isolation", () => {
  beforeEach(() => {
    session.permissions = [];
    window.history.replaceState(null, "", "/reports");
  });
  it("opens library reports without mounting school reports for a library-only account", async () => {
    session.permissions = ["view_library_reports"];
    window.history.replaceState(null, "", "/reports?section=school");
    render(
      <Suspense>
        <ReportsWorkspaceView />
      </Suspense>,
    );
    expect(await screen.findByTestId("library-report")).toHaveTextContent("libraryTab");
    expect(screen.queryByTestId("school-report")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
  it("does not render any report domain without a grant", () => {
    render(
      <Suspense>
        <ReportsWorkspaceView />
      </Suspense>,
    );
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(screen.queryByTestId("school-report")).not.toBeInTheDocument();
  });
  it("uses independent tab keys and preserves each domain's bookmarked selection", async () => {
    session.permissions = ["view_reports", "view_library_reports", "view_visitor_reports"];
    window.history.replaceState(
      null,
      "",
      "/reports?tab=schedules&libraryTab=loans&visitorsTab=monthly",
    );
    render(
      <Suspense>
        <ReportsWorkspaceView />
      </Suspense>,
    );
    expect(await screen.findByTestId("school-report")).toHaveTextContent("tab");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "libraryReports" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByTestId("library-report")).toHaveTextContent("libraryTab");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "visitorReports" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByTestId("visitor-report")).toHaveTextContent("visitorsTab");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("schedules");
    expect(new URLSearchParams(window.location.search).get("libraryTab")).toBe("loans");
    expect(new URLSearchParams(window.location.search).get("visitorsTab")).toBe("monthly");
  });
});
