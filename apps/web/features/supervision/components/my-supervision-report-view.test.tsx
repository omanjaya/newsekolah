import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MySupervisionReportView } from "./my-supervision-report-view";

const replace = vi.fn();
const session = vi.fn<() => unknown>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/supervision/my-report",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => session() as never,
}));
vi.mock("./supervision-workspace-nav", () => ({ SupervisionWorkspaceNav: () => null }));
vi.mock("./teacher-supervision-report-view", () => ({
  TeacherSupervisionReportView: () => <div>report</div>,
}));
vi.mock("../api", () => ({
  useSupervisionCyclesQuery: () => ({
    data: { data: [{ id: "c1", name: "Siklus 1" }] },
    isLoading: false,
    isError: false,
  }),
}));

beforeEach(() => {
  replace.mockReset();
});

afterEach(cleanup);

describe("MySupervisionReportView", () => {
  it("sends a non-teaching account to the cycles instead of a misleading empty report", () => {
    session.mockReturnValue({ me: { id: "u1", profile_kind: "staff" } });
    render(<MySupervisionReportView />);
    expect(replace).toHaveBeenCalledWith("/supervision/cycles");
    expect(screen.queryByText("report")).not.toBeInTheDocument();
  });

  it("keeps a teacher on their own report", () => {
    session.mockReturnValue({ me: { id: "u2", profile_kind: "teacher" } });
    render(<MySupervisionReportView />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("report")).toBeInTheDocument();
  });
});
