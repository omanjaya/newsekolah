import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as PermitsApi from "../../permits/api";

const mocks = vi.hoisted(() => ({
  exitStage: vi.fn(),
  lateStage: vi.fn(),
  refetchLate: vi.fn(),
  refetchMine: vi.fn(),
  libraryVisit: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error:${code}`,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { disabled_modules: [] } }),
}));
vi.mock("../../library/visits-api", () => ({
  useScanLibraryKioskVisitMutation: () => ({ mutateAsync: mocks.libraryVisit }),
}));
vi.mock("../../permits/api", async (importOriginal) => {
  const actual = await importOriginal<typeof PermitsApi>();
  return {
    ...actual,
    useCurrentLateArrivalQuery: () => ({ refetch: mocks.refetchLate }),
    useMyExitPermitsQuery: () => ({ refetch: mocks.refetchMine }),
    useOpenLateArrivalMutation: () => ({ mutateAsync: vi.fn() }),
    useScanClassroomEntryMutation: () => ({ mutateAsync: vi.fn() }),
    useScanExitPermitStageMutation: () => ({ mutateAsync: mocks.exitStage }),
    useScanGateMutation: () => ({ mutateAsync: vi.fn() }),
    useScanLateArrivalStageMutation: () => ({ mutateAsync: mocks.lateStage }),
  };
});

import { useScanDispatch } from "./use-scan-dispatch";

function lateArrival(id: string, status = "in_progress") {
  return { data: { instance: { id, status, current_stage: { verification: "qr_scan" } } } };
}

describe("useScanDispatch approver QR", () => {
  beforeEach(() => {
    mocks.exitStage.mockReset();
    mocks.lateStage.mockReset();
    mocks.refetchLate.mockReset();
  });

  it("sends a late-arrival approver QR to the late-arrival endpoint", async () => {
    mocks.refetchLate.mockResolvedValue(lateArrival("late-1"));
    mocks.lateStage.mockResolvedValue({});
    const { result } = renderHook(() => useScanDispatch());

    const outcome = await result.current("sion:approve:late-1:tok");

    expect(mocks.lateStage).toHaveBeenCalledWith({ id: "late-1", token: "tok" });
    expect(mocks.exitStage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, message: "results.late_arrival_stage" });
  });

  it("sends an exit-permit approver QR to the exit-permit endpoint", async () => {
    mocks.refetchLate.mockResolvedValue(lateArrival("late-1"));
    mocks.exitStage.mockResolvedValue({ student_name: "Siswa Contoh" });
    const { result } = renderHook(() => useScanDispatch());

    const outcome = await result.current("sion:approve:exit-9:tok");

    expect(mocks.exitStage).toHaveBeenCalledWith({ id: "exit-9", token: "tok" });
    expect(mocks.lateStage).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
  });

  it("falls back to the exit permit when no late arrival is open", async () => {
    mocks.refetchLate.mockResolvedValue({ data: null });
    mocks.exitStage.mockResolvedValue({ student_name: "Siswa Contoh" });
    const { result } = renderHook(() => useScanDispatch());

    await result.current("sion:approve_stage:exit-9:tok");

    expect(mocks.exitStage).toHaveBeenCalledWith({ id: "exit-9", token: "tok" });
  });
});

// The duty desk's "Izin keluar" QR names no permit ("sion:approve_stage::<token>"):
// the student's scan supplies their own, as the exit permit screen's dialog does.
describe("useScanDispatch duty desk approval QR", () => {
  const picket = {
    key: "picket",
    label: "Guru piket",
    approver_rule: "any_teacher",
    verification: "qr_scan",
  };
  const counselor = { ...picket, key: "bk", label: "Guru BK", approver_rule: "duty:counselor" };

  beforeEach(() => {
    mocks.exitStage.mockReset();
    mocks.lateStage.mockReset();
    mocks.refetchLate.mockReset();
    mocks.refetchMine.mockReset();
  });

  it("approves the student's own exit permit waiting on the desk", async () => {
    mocks.refetchMine.mockResolvedValue({
      data: {
        data: [
          { id: "exit-old", status: "completed", current_stage: picket },
          { id: "exit-7", status: "in_progress", current_stage: picket },
        ],
      },
    });
    mocks.exitStage.mockResolvedValue({ student_name: "Siswa Contoh" });
    const { result } = renderHook(() => useScanDispatch());

    const outcome = await result.current("sion:approve_stage::desk-tok");

    expect(mocks.refetchMine).toHaveBeenCalledWith({ throwOnError: true });
    expect(mocks.exitStage).toHaveBeenCalledWith({ id: "exit-7", token: "desk-tok" });
    expect(mocks.lateStage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, message: "results.exit_stage" });
  });

  it("says so, without a request, when no own permit waits on the desk", async () => {
    mocks.refetchMine.mockResolvedValue({
      data: { data: [{ id: "exit-7", status: "in_progress", current_stage: counselor }] },
    });
    const { result } = renderHook(() => useScanDispatch());

    const outcome = await result.current("sion:approve_stage::desk-tok");

    expect(mocks.exitStage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, message: "failures.noPermitAwaitingDesk" });
  });
});

describe("useScanDispatch library visit", () => {
  beforeEach(() => {
    mocks.libraryVisit.mockReset();
  });

  it("confirms a new visit", async () => {
    mocks.libraryVisit.mockResolvedValue({ id: "v1", already_recorded: false });
    const { result } = renderHook(() => useScanDispatch());

    const outcome = await result.current("sion:library_visit::tok");

    expect(mocks.libraryVisit).toHaveBeenCalledWith({ token: "tok" });
    expect(outcome).toMatchObject({ ok: true, message: "results.library_visit" });
  });

  // A second scan inside 30 minutes is folded into the first visit; the
  // member is told so instead of reading "recorded" again.
  it("says a repeat scan within 30 minutes was already recorded", async () => {
    mocks.libraryVisit.mockResolvedValue({ id: "v1", already_recorded: true });
    const { result } = renderHook(() => useScanDispatch());

    const outcome = await result.current("sion:library_visit::tok");

    expect(outcome).toMatchObject({ ok: true, message: "results.library_visit_already" });
  });
});
