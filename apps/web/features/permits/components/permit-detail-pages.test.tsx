import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exitQuery: vi.fn(),
  lateQuery: vi.fn(),
  me: { id: "student-1", tenant: { timezone: "Asia/Makassar" } },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { n?: number }) =>
    values?.n !== undefined ? `${key}:${values.n}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <div data-testid="query-error" />,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: mocks.me }),
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => new Map([["student-1", { id: "student-1", name: "SISWA CONTOH" }]]),
}));
vi.mock("../api", () => ({
  useExitPermitQuery: mocks.exitQuery,
  useLateArrivalQuery: mocks.lateQuery,
}));
vi.mock("./exit-permit-detail", () => ({
  ActiveExitPermitCard: () => <div data-testid="active-exit-card" />,
  ExitPermitDetail: () => <div data-testid="exit-record" />,
}));
vi.mock("./late-arrivals-view", () => ({
  ActiveLateArrival: () => <div data-testid="active-late-card" />,
}));
vi.mock("./workflow-stepper", () => ({ WorkflowStepper: () => <div data-testid="stepper" /> }));

import { ExitPermitPageView } from "./exit-permit-page-view";
import { LateArrivalPageView } from "./late-arrival-page-view";

const notFound = new ApiError({ status: 404, code: "NOT_FOUND", message: "x" });

/** Opened now unless `openedAt` says otherwise: today on the school's clock. */
function exitPermit(status: string, openedAt = new Date().toISOString()) {
  return {
    data: {
      instance: { id: "exit-1", status, subject_user_id: "student-1", opened_at: openedAt },
      student_name: "SISWA CONTOH",
      class_name: "X-A",
    },
  };
}

function lateArrival(status: string) {
  return {
    isLoading: false,
    data: {
      instance: {
        id: "late-1",
        status,
        subject_user_id: "student-1",
        opened_at: "2026-11-20T00:10:00Z",
        stages: [],
      },
      reason: "Macet",
      occurrence_number: 3,
      required_action: "none",
      homeroom_reported: false,
      class_name: "X-A",
    },
  };
}

beforeEach(() => {
  mocks.me = { id: "student-1", tenant: { timezone: "Asia/Makassar" } };
});

describe("ExitPermitPageView", () => {
  it("gives the student their live card while the permit is on its way", () => {
    mocks.exitQuery.mockReturnValue(exitPermit("approved"));
    render(<ExitPermitPageView id="exit-1" />);
    expect(screen.getByTestId("active-exit-card")).toBeInTheDocument();
  });

  // The regression: a permit left at the duty teacher's stage two days
  // earlier got the live card here (with "Batalkan izin"), while the
  // history dialog showed the record.
  it("gives the student the read-only record of a permit left open on an earlier day", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    mocks.exitQuery.mockReturnValue(exitPermit("in_progress", twoDaysAgo));
    render(<ExitPermitPageView id="exit-1" />);
    expect(screen.getByTestId("exit-record")).toBeInTheDocument();
    expect(screen.queryByTestId("active-exit-card")).not.toBeInTheDocument();
  });

  it("gives the guard who was notified the read-only record", () => {
    mocks.me = { id: "satpam-1", tenant: { timezone: "Asia/Makassar" } };
    mocks.exitQuery.mockReturnValue(exitPermit("approved"));
    render(<ExitPermitPageView id="exit-1" />);
    expect(screen.getByTestId("exit-record")).toBeInTheDocument();
    expect(screen.getByText("Siswa Contoh (X-A)")).toBeInTheDocument();
  });

  it("is the shared not-found page for an id the reader cannot open", () => {
    mocks.exitQuery.mockReturnValue({ data: undefined, error: notFound });
    render(<ExitPermitPageView id="missing" />);
    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "notFoundBack" })).toHaveAttribute(
      "href",
      "/exit-permits",
    );
  });
});

describe("LateArrivalPageView", () => {
  it("gives the student their status card, titled by the occurrence", () => {
    mocks.lateQuery.mockReturnValue(lateArrival("completed"));
    render(<LateArrivalPageView id="late-1" />);
    expect(screen.getByTestId("active-late-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "historyRow:3" })).toBeInTheDocument();
  });

  it("gives the homeroom teacher the record, naming the student", () => {
    mocks.me = { id: "guru-1", tenant: { timezone: "Asia/Makassar" } };
    mocks.lateQuery.mockReturnValue(lateArrival("in_progress"));
    render(<LateArrivalPageView id="late-1" />);
    expect(screen.getByTestId("stepper")).toBeInTheDocument();
    expect(screen.getByText("Macet")).toBeInTheDocument();
    expect(screen.getByText("Siswa Contoh · X-A")).toBeInTheDocument();
    expect(screen.queryByTestId("active-late-card")).not.toBeInTheDocument();
  });

  it("is the shared not-found page for an id the reader cannot open", () => {
    mocks.lateQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError({ status: 403, code: "WORKFLOW_NOT_SUBJECT", message: "x" }),
    });
    render(<LateArrivalPageView id="late-1" />);
    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
  });
});
