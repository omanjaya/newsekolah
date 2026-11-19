import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExitPermitDetail } from "../api";

const PERMIT_ID = "0b5e8f5a-6a3c-4b1f-9a62-2f3c1d7e9a10";
const GATE_TOKEN = "gate-token-of-forty-three-characters-xxxxxxx";

const mocks = vi.hoisted(() => ({
  detail: undefined as ExitPermitDetail | undefined,
  cancel: vi.fn(),
  gate: undefined as { token: string; expires_at: string } | undefined,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@newsekolah/i18n", () => ({
  formatTime: () => "07:10",
  formatDateTime: () => "29 Sep 2026, 07:10",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({ usePeriodsQuery: () => ({ data: { data: [] } }) }));
vi.mock("../api", () => ({
  encodeScanPayload: (kind: string, id: string, token: string) => `sion:${kind}:${id}:${token}`,
  useExitPermitQuery: () => ({
    data: mocks.detail,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCancelExitPermitMutation: () => ({ mutateAsync: mocks.cancel, isPending: false }),
  useIssueGateTokenMutation: () => ({ mutate: vi.fn(), data: mocks.gate, isPending: false }),
  useScanExitPermitStageMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExitPermitMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./stage-scan-dialog", () => ({ StageScanDialog: () => null }));

import { ActiveExitPermitCard } from "./exit-permit-detail";

function detail(status: "in_progress" | "approved"): ExitPermitDetail {
  const stages = [
    {
      key: "duty_teacher",
      label: "Guru piket",
      approver_rule: "any_teacher",
      verification: "qr_scan" as const,
    },
    {
      key: "counselor",
      label: "Guru BK",
      approver_rule: "duty:counselor",
      verification: "qr_scan" as const,
    },
  ];
  return {
    instance: {
      id: PERMIT_ID,
      kind: "exit_permit",
      status,
      current_stage_index: 0,
      stages,
      ...(status === "in_progress" ? { current_stage: stages[0] } : {}),
      subject_user_id: "student-1",
      opened_at: "2026-09-29T00:10:00Z",
    },
    destination: "Puskesmas",
    start_period_id: "p1",
    end_period_id: "p2",
    student_name: "Siswa Satu",
    class_name: "10 A",
  };
}

beforeEach(() => {
  mocks.cancel.mockReset();
  mocks.cancel.mockResolvedValue(undefined);
  mocks.gate = undefined;
});

describe("ActiveExitPermitCard", () => {
  it("never shows the permit's raw id: the picket stage is approved by scanning the desk QR", () => {
    mocks.detail = detail("in_progress");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);
    expect(screen.queryByText(PERMIT_ID)).not.toBeInTheDocument();
    expect(screen.queryByText("code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "hero.scanStage" })).toBeInTheDocument();
  });

  it("asks before cancelling, and cancels only on confirm", async () => {
    mocks.detail = detail("in_progress");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("cancelConfirm.title")).toBeInTheDocument();
    expect(mocks.cancel).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "cancelConfirm.keep" }));
    expect(mocks.cancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "cancelConfirm.confirm" }),
    );
    expect(mocks.cancel).toHaveBeenCalledWith(PERMIT_ID);
  });

  it("prints no token under the gate QR", () => {
    mocks.detail = detail("approved");
    mocks.gate = { token: GATE_TOKEN, expires_at: new Date(Date.now() + 60_000).toISOString() };
    render(<ActiveExitPermitCard id={PERMIT_ID} />);
    expect(screen.getByRole("img", { name: "gateQrLabel" })).toBeInTheDocument();
    expect(screen.queryByText(GATE_TOKEN)).not.toBeInTheDocument();
  });
});
