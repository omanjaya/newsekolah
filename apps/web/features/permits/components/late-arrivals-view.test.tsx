import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: {},
  byId: {},
  byIdCalls: [] as string[],
  scanDialog: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.stage ? `${key}:${values.stage}` : key,
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <div data-testid="query-error" />,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { profile_kind: "student", tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../lib/use-can-submit-permit", () => ({ useCanSubmitPermit: () => true }));
vi.mock("./workflow-stepper", () => ({
  WorkflowStepper: () => null,
  WorkflowSteps: () => <div data-testid="steps" />,
}));
vi.mock("./stage-scan-dialog", () => ({
  StageScanDialog: (props: unknown) => {
    mocks.scanDialog(props);
    return null;
  },
}));
vi.mock("../api", () => ({
  decodeScanPayload: (raw: string) => ({ token: raw }),
  useCurrentLateArrivalQuery: () => mocks.current,
  useLateArrivalQuery: (id: string) => {
    mocks.byIdCalls.push(id);
    return id === "" ? { data: undefined, isLoading: false, isError: false } : mocks.byId;
  },
  useOpenLateArrivalMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviewLateArrivalMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useScanLateArrivalStageMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { LateArrivalsView } from "./late-arrivals-view";

const leadership = {
  key: "leadership",
  label: "Pimpinan",
  approver_rule: "duty:leadership",
  verification: "qr_scan",
};

function detail(status: string, requiredAction = "none") {
  return {
    instance: {
      id: "late-1",
      status,
      current_stage_index: status === "in_progress" ? 1 : 2,
      current_stage: status === "in_progress" ? leadership : undefined,
      subject_user_id: "me",
      opened_at: "2026-11-19T00:10:00Z",
      stages: [],
    },
    reason: "Macet",
    occurrence_number: 1,
    required_action: requiredAction,
    homeroom_reported: false,
  };
}

beforeEach(() => {
  mocks.current = { isLoading: false, isError: false, data: null, refetch: vi.fn() };
  mocks.byId = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
  mocks.byIdCalls = [];
  mocks.scanDialog.mockReset();
});

describe("LateArrivalsView for a student", () => {
  it("offers the desk check-in when no late arrival is open", () => {
    render(<LateArrivalsView />);
    expect(screen.getByText("scanTitle")).toBeInTheDocument();
    // The desk QR prints no code: the typed field is for a hardware
    // scanner, and the page says what to do without a camera.
    expect(screen.getByText("cannotScanHint")).toBeInTheDocument();
    expect(screen.queryByTestId("query-error")).not.toBeInTheDocument();
  });

  it("shows the error, not a second check-in, when the current late arrival fails to load", () => {
    mocks.current = {
      isLoading: false,
      isError: true,
      error: new Error("500"),
      data: undefined,
      refetch: vi.fn(),
    };
    render(<LateArrivalsView />);
    expect(screen.getByTestId("query-error")).toBeInTheDocument();
    expect(screen.queryByText("scanTitle")).not.toBeInTheDocument();
  });

  it("states the occurrence once, in the eyebrow, not again in the details", () => {
    mocks.current = { ...mocks.current, data: detail("in_progress") };
    render(<LateArrivalsView />);
    expect(screen.getByText("hero.eyebrow")).toBeInTheDocument();
    expect(screen.queryByText("occurrence")).not.toBeInTheDocument();
    expect(screen.getByText("requiredAction")).toBeInTheDocument();
  });

  it("keeps the finished flow on screen after the last scan instead of a second check-in", () => {
    mocks.current = { ...mocks.current, data: detail("in_progress") };
    const { rerender } = render(<LateArrivalsView />);
    expect(screen.queryByText("completedBody")).not.toBeInTheDocument();

    // The last stage's scan closes the flow: "current" no longer returns it.
    mocks.current = { ...mocks.current, data: null };
    mocks.byId = { data: detail("completed"), isLoading: false, isError: false, refetch: vi.fn() };
    rerender(<LateArrivalsView />);

    expect(mocks.byIdCalls.at(-1)).toBe("late-1");
    expect(screen.getByText("completedBody")).toBeInTheDocument();
    expect(screen.getByText("status.completed")).toBeInTheDocument();
    expect(screen.queryByText("scanTitle")).not.toBeInTheDocument();
  });

  it("names the approved stage on a scan, and says the flow is done on the last one", () => {
    mocks.current = { ...mocks.current, data: detail("in_progress") };
    render(<LateArrivalsView />);

    const props = mocks.scanDialog.mock.calls.at(-1)?.[0] as {
      successMessage: (result: {
        instance: { status: string };
        required_action?: string;
      }) => string;
    };
    expect(props.successMessage({ instance: { status: "in_progress" } })).toBe(
      "stageApproved:Pimpinan",
    );
    expect(
      props.successMessage({ instance: { status: "completed" }, required_action: "none" }),
    ).toBe("finished");
  });

  it("does not send a student who is sent home to class when the flow completes", () => {
    mocks.current = { ...mocks.current, data: detail("in_progress", "send_home") };
    const { rerender } = render(<LateArrivalsView />);

    const props = mocks.scanDialog.mock.calls.at(-1)?.[0] as {
      successMessage: (result: { instance: { status: string }; required_action: string }) => string;
    };
    expect(
      props.successMessage({ instance: { status: "completed" }, required_action: "send_home" }),
    ).toBe("finishedSendHome");

    mocks.current = { ...mocks.current, data: null };
    mocks.byId = {
      data: detail("completed", "send_home"),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    rerender(<LateArrivalsView />);

    expect(screen.getByText("completedBodySendHome")).toBeInTheDocument();
    expect(screen.queryByText("completedBody")).not.toBeInTheDocument();
  });
});
