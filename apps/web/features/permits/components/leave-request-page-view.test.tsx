import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { category?: string }) =>
    values?.category ? `${key}:${values.category}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../api", () => ({ useLeaveRequestQuery: query }));
vi.mock("./leave-request-detail", () => ({
  LeaveRequestDetail: ({ layout }: { layout?: string }) => (
    <div data-testid="leave-request-detail" data-layout={layout} />
  ),
}));

import { LeaveRequestPageView } from "./leave-request-page-view";

describe("LeaveRequestPageView", () => {
  it("names the request in the header: its kind of leave, then the student and dates", () => {
    query.mockReturnValue({
      data: {
        category: "sick",
        student_name: "SISWA CONTOH",
        class_name: "X-A",
        starts_on: "2026-11-17",
        ends_on: "2026-11-17",
      },
    });
    render(<LeaveRequestPageView id="leave-1" />);

    // "Izin sakit", not the bare category the Keterangan row may repeat.
    expect(screen.getByRole("heading", { level: 1, name: "pageTitle:sick" })).toBeInTheDocument();
    expect(screen.getByText(/^Siswa Contoh \(X-A\) · /)).toBeInTheDocument();
    expect(screen.getByTestId("leave-request-detail")).toHaveAttribute("data-layout", "page");
  });

  it("keeps a generic title while the request loads", () => {
    query.mockReturnValue({ data: undefined });
    render(<LeaveRequestPageView id="leave-1" />);

    expect(screen.getByRole("heading", { level: 1, name: "detailTitle" })).toBeInTheDocument();
  });
});
