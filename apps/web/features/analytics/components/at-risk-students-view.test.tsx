import { ApiError } from "@newsekolah/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AtRiskStudentsView } from "./at-risk-students-view";

interface QueryState {
  data: unknown;
  isLoading: boolean;
  error: unknown;
}
let query: QueryState = { data: undefined, isLoading: false, error: null };
const push = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/analytics",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => false,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "c1", name: "X-A" }] } }),
  useLookup: (items: { id: string; name: string }[] = []) =>
    new Map(items.map((item) => [item.id, item])),
}));
const loadedNames = new Map([
  ["s1", { id: "s1", name: "Budi Santoso" }],
  ["s2", { id: "s2", name: "Citra Lestari" }],
]);
let names = loadedNames;
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => names,
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../student-services/components/service-workspace-nav", () => ({
  CounselingWorkspaceNav: () => null,
}));
vi.mock("../api", () => ({ useAtRiskStudentsQuery: () => query }));
vi.mock("./policy-dialog", () => ({ PolicyDialog: () => null }));
vi.mock("./risk-level-summary", () => ({ RiskLevelSummary: () => null }));

const row = (id: string, score: number) => ({
  student_user_id: id,
  class_id: "c1",
  level: "watch",
  score,
  computed_at: "2026-09-25T01:00:00Z",
});

beforeEach(() => {
  names = loadedNames;
  push.mockReset();
  query = { data: { data: [row("s1", 10), row("s2", 5)] }, isLoading: false, error: null };
});

describe("AtRiskStudentsView rows and header", () => {
  it("opens a row on the student's early-warning detail, whose trail leads back here", () => {
    render(<AtRiskStudentsView />);
    // The phone card's tap target, named after the row's title cell.
    const [card] = screen.getAllByRole("button", { name: /Budi Santoso/ });
    fireEvent.click(card ?? document.body);
    expect(push).toHaveBeenCalledWith("/analytics/s1");
  });

  it("leaves the h1 to the area and says how the list is ordered above it", () => {
    render(<AtRiskStudentsView />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText(/sortedHint/)).toBeInTheDocument();
  });
});

describe("AtRiskStudentsView", () => {
  it("finds a student by name through the table search box", async () => {
    render(<AtRiskStudentsView />);
    expect(screen.getAllByText("Budi Santoso").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText("searchPlaceholder"), {
      target: { value: "citra" },
    });
    await waitFor(() => {
      expect(screen.queryAllByText("Budi Santoso")).toHaveLength(0);
    });
    expect(screen.getAllByText("Citra Lestari").length).toBeGreaterThan(0);
  });

  it("explains a missing assignment and offers a way back instead of a bare alert", () => {
    query = {
      data: undefined,
      isLoading: false,
      error: new ApiError({ status: 403, code: "FORBIDDEN", message: "forbidden" }),
    };
    render(<AtRiskStudentsView />);
    expect(screen.getByText("notAssignedTitle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backHome" })).toHaveAttribute("href", "/dashboard");
  });

  it("still finds a student whose name resolves after the search was typed", async () => {
    names = new Map();
    const view = render(<AtRiskStudentsView />);
    fireEvent.change(screen.getByPlaceholderText("searchPlaceholder"), {
      target: { value: "citra" },
    });
    await waitFor(() => {
      expect(screen.queryAllByText("unknownStudent")).toHaveLength(0);
    });

    names = loadedNames;
    view.rerender(<AtRiskStudentsView />);
    await waitFor(() => {
      expect(screen.getAllByText("Citra Lestari").length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByText("Budi Santoso")).toHaveLength(0);
  });
});
