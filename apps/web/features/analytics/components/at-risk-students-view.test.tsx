import { ApiError } from "@newsekolah/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AtRiskStudentsView } from "./at-risk-students-view";

const mocks = vi.hoisted(() => ({
  query: { data: undefined, isLoading: false, error: null },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => false }));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "c1", name: "X-A" }] } }),
  useLookup: (items: { id: string; name: string }[] = []) =>
    new Map(items.map((item) => [item.id, item])),
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () =>
    new Map([
      ["s1", { id: "s1", name: "Budi Santoso" }],
      ["s2", { id: "s2", name: "Citra Lestari" }],
    ]),
}));
vi.mock("../../student-services/components/service-workspace-nav", () => ({
  CounselingWorkspaceNav: () => null,
}));
vi.mock("../../students/components/student-link", () => ({
  StudentLink: ({ children }: { children: string }) => <span>{children}</span>,
}));
vi.mock("../api", () => ({ useAtRiskStudentsQuery: () => mocks.query }));
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
  mocks.query = { data: { data: [row("s1", 10), row("s2", 5)] }, isLoading: false, error: null };
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
    mocks.query = {
      data: undefined,
      isLoading: false,
      error: new ApiError({ status: 403, code: "FORBIDDEN", message: "forbidden" }),
    };
    render(<AtRiskStudentsView />);
    expect(screen.getByText("notAssignedTitle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backHome" })).toHaveAttribute("href", "/dashboard");
  });
});
