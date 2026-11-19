import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "approve-token-of-forty-three-characters-xxxx";

const mocks = vi.hoisted(() => ({
  mint: vi.fn(),
  exitIds: [] as string[],
  lateIds: [] as string[],
  directoryIds: [] as string[][],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.stage ? `${key}:${values.stage}` : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: (ids: string[]) => {
    mocks.directoryIds.push(ids);
    return new Map(ids.map((id) => [id, { id, name: "Siswa Terlambat", username: "s" }]));
  },
}));
vi.mock("./workflow-stepper", () => ({ WorkflowSteps: () => <div data-testid="steps" /> }));

const leadershipStage = {
  key: "leadership",
  label: "Pimpinan",
  approver_rule: "duty:leadership",
  verification: "qr_scan",
};
const counselorStage = {
  key: "counselor",
  label: "Guru BK",
  approver_rule: "duty:counselor",
  verification: "qr_scan",
};

vi.mock("../api", () => ({
  encodeScanPayload: (kind: string, id: string, token: string) => `sion:${kind}:${id}:${token}`,
  useIssueScanTokenMutation: () => ({
    mutate: mocks.mint,
    data: {
      token: TOKEN,
      purpose: "approve_stage",
      context_id: "x",
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    },
    isError: false,
    isPending: false,
  }),
  useExitPermitQuery: (id: string) => {
    mocks.exitIds.push(id);
    return {
      data:
        id === ""
          ? undefined
          : {
              instance: { id, subject_user_id: "student-e", current_stage: counselorStage },
              student_name: "Siswa Izin",
              class_name: "10 A",
              destination: "Puskesmas",
            },
      error: null,
      refetch: vi.fn(),
    };
  },
  useLateArrivalQuery: (id: string) => {
    mocks.lateIds.push(id);
    return {
      data:
        id === ""
          ? undefined
          : {
              instance: { id, subject_user_id: "student-l", current_stage: leadershipStage },
              reason: "Macet",
            },
      error: null,
      refetch: vi.fn(),
    };
  },
}));

import { ApprovePanel } from "./approve-panel";

beforeEach(() => {
  mocks.mint.mockClear();
  mocks.exitIds = [];
  mocks.lateIds = [];
  mocks.directoryIds = [];
});

describe("ApprovePanel", () => {
  it("mints a stage QR bound to the late arrival, names the student and prints no code", () => {
    render(<ApprovePanel kind="late_arrival" instanceId="late-1" />);

    expect(mocks.mint).toHaveBeenCalledWith(
      { purpose: "approve_stage", context_id: "late-1" },
      expect.anything(),
    );
    expect(screen.getByRole("img", { name: "qrLabelStage:Pimpinan" })).toBeInTheDocument();
    expect(screen.getByText("hintStage:Pimpinan")).toBeInTheDocument();
    expect(screen.getByText("Siswa Terlambat")).toBeInTheDocument();
    expect(screen.getByText("Macet")).toBeInTheDocument();
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
    // Only the late arrival's own detail is read.
    expect(mocks.exitIds.every((id) => id === "")).toBe(true);
  });

  it("reads an exit permit's own detail for its stage QR", () => {
    render(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);

    expect(mocks.mint).toHaveBeenCalledWith(
      { purpose: "approve_stage", context_id: "exit-1" },
      expect.anything(),
    );
    expect(screen.getByRole("img", { name: "qrLabelStage:Guru BK" })).toBeInTheDocument();
    expect(screen.getByText("Siswa Izin")).toBeInTheDocument();
    expect(screen.getByText("Puskesmas")).toBeInTheDocument();
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
    expect(mocks.lateIds.every((id) => id === "")).toBe(true);
  });
});
