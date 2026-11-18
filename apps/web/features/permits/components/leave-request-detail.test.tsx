import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LeaveRequestDetail } from "./leave-request-detail";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

vi.mock("../../../components/query-error", () => ({
  QueryError: () => <div data-testid="query-error" />,
}));

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

vi.mock("../../../lib/media/compress-image", () => ({ compressImage: vi.fn() }));

let permissions = new Set<string>();

vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => permissions.has(permission),
  useSession: () => ({ me: { id: "teacher-1", tenant: { timezone: "Asia/Jakarta" } } }),
}));

vi.mock("./workflow-stepper", () => ({ WorkflowStepper: () => null }));

const stage = (key: string) => ({
  key,
  label: key,
  approver_rule: "homeroom_of_student",
  verification: "manual" as const,
});

let detail: Record<string, unknown> = {};

// The "../api" factory below is hoisted above this module's body and hands
// this function over as a hook, so it has to exist before the factory runs.
const mutation = vi.hoisted(() => () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  variables: undefined,
}));

vi.mock("../api", () => ({
  LEAVE_EVIDENCE_MAX_LONG_EDGE: 1600,
  useLeaveRequestQuery: () => ({ data: detail, isLoading: false, error: null, refetch: vi.fn() }),
  useReviewLeaveRequestMutation: mutation,
  useIssueLeaveLetterMutation: mutation,
  useUploadEvidenceMutation: mutation,
  useLeaveDocumentUrlMutation: mutation,
}));

function leave(status: string, stageIndex: number, overrides: Record<string, unknown> = {}) {
  const stages = [stage("homeroom"), stage("counselor")];
  return {
    category: "sick",
    starts_on: "2026-11-18",
    ends_on: "2026-11-19",
    student_name: "Siswa Contoh",
    class_name: "X-A",
    reason: "Demam",
    has_evidence: false,
    has_letter: false,
    instance: {
      id: "leave-1",
      kind: "leave_request",
      status,
      current_stage_index: stageIndex,
      current_stage: stages[stageIndex],
      stages,
      subject_user_id: "student-1",
      opened_at: "2026-11-17T05:54:00Z",
    },
    ...overrides,
  };
}

describe("LeaveRequestDetail", () => {
  // The alert said the letter could be downloaded "above" while its
  // button was the card's last control, under the fold on a phone.
  it("offers the issued letter in the outcome alert, once", () => {
    permissions = new Set();
    detail = leave("completed", 1, { has_letter: true, letter_number: "4/IZIN/XI/2026" });
    render(<LeaveRequestDetail id="leave-1" layout="page" />);

    const alert = screen.getByRole("status");
    expect(within(alert).getByRole("button", { name: "downloadLetter" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "downloadLetter" })).toHaveLength(1);
  });

  // Anchored at the shell's full offset, the stuck block floated 32px (the
  // centre button's rise) above the tab bar and carried the note too.
  it("docks only the decision's buttons on a phone's tab bar", () => {
    permissions = new Set(["review_leave_requests"]);
    detail = leave("in_progress", 0);
    const { container } = render(<LeaveRequestDetail id="leave-1" layout="page" />);

    const row = container.querySelector<HTMLElement>('[data-slot="leave-decision"]');
    if (!row) throw new Error("the decision row is missing");
    expect(row).toHaveClass(
      "max-md:sticky",
      "max-md:bottom-[calc(var(--shell-mobile-tab-bar,0px)+env(safe-area-inset-bottom))]",
      "max-md:pb-[calc(var(--space-3)+var(--shell-mobile-tab-raise,0px))]",
      "grid-cols-2",
    );
    expect(row.className).not.toContain("--shell-mobile-tab-offset");
    expect(within(row).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["reject", "approve"]);
  });

  it("keeps the inbox dialog's decision in its flow", () => {
    permissions = new Set(["review_leave_requests"]);
    detail = leave("in_progress", 0);
    const { container } = render(<LeaveRequestDetail id="leave-1" />);

    const row = container.querySelector<HTMLElement>('[data-slot="leave-decision"]');
    expect(row?.className).not.toContain("sticky");
  });
});
