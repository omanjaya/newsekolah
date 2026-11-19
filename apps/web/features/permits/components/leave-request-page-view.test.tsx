import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const permissions = vi.hoisted(() => ({ current: new Set<string>() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { category?: string }) =>
    values?.category ? `${key}:${values.category}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../api", () => ({ useLeaveRequestQuery: query }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => permissions.current.has(permission),
}));
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

  // The page kept "Detail izin" as its tab title and h1 above an empty
  // state, unlike every other detail route's not-found page.
  describe("a request the reader cannot open", () => {
    it("is the shared not-found page, its title the tab's, leading a student to their requests", () => {
      permissions.current = new Set();
      query.mockReturnValue({
        data: undefined,
        error: new ApiError({
          status: 400,
          code: "VALIDATION_FAILED",
          message: "invalid",
          details: [{ field: "id", code: "INVALID_FORMAT" }],
        }),
      });
      render(<LeaveRequestPageView id="abc" />);

      expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "detailTitle" })).not.toBeInTheDocument();
      expect(screen.getByTestId("app-page")).toHaveAttribute("data-page-title", "notFoundTitle");
      expect(screen.getByText("notFoundBody")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "notFoundBackToMine" })).toHaveAttribute(
        "href",
        "/leave-requests",
      );
      expect(screen.queryByTestId("leave-request-detail")).not.toBeInTheDocument();
    });

    it("leads a reviewer to the leave queue, for a request they may not see too", () => {
      permissions.current = new Set(["review_leave_requests"]);
      query.mockReturnValue({
        data: undefined,
        error: new ApiError({ status: 403, code: "FORBIDDEN", message: "forbidden" }),
      });
      render(<LeaveRequestPageView id="missing" />);

      expect(screen.getByRole("link", { name: "issuerOpenInbox" })).toHaveAttribute(
        "href",
        "/inbox?type=leave",
      );
    });

    it("keeps the page and its retry for a failure that is not a missing request", () => {
      query.mockReturnValue({
        data: undefined,
        error: new ApiError({ status: 500, code: "INTERNAL", message: "boom" }),
      });
      render(<LeaveRequestPageView id="leave-1" />);

      expect(screen.getByTestId("leave-request-detail")).toBeInTheDocument();
      expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    });
  });
});
