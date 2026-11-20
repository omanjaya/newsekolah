import type * as Ui from "@newsekolah/ui";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { mutate, toast } = vi.hoisted(() => ({
  mutate: vi.fn(),
  toast: { success: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: undefined }),
}));
vi.mock("../../../lib/modules/feature-modules", () => ({
  isModuleEnabled: () => true,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("@newsekolah/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof Ui>();
  return {
    ...actual,
    useToast: () => toast,
    // Rendered inline so the form is reachable without a portal.
    Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  };
});
vi.mock("../api", () => ({
  useEarlyWarningPolicyQuery: () => ({
    isLoading: false,
    error: null,
    data: {
      version: 1,
      window_days: 20,
      attendance_watch_rate: 0.1,
      attendance_at_risk_rate: 0.2,
      discipline_watch_points: 10,
      discipline_at_risk_points: 25,
      warning_letter_watch_count: 1,
      warning_letter_at_risk_count: 2,
      grade_drop_watch_points: 5,
      grade_drop_at_risk_points: 10,
      below_kktp_watch_count: 1,
      below_kktp_at_risk_count: 3,
      attendance_weight: 30,
      discipline_weight: 30,
      warning_weight: 20,
      grade_weight: 20,
      watch_score: 30,
      at_risk_score: 60,
    },
  }),
  useUpdateEarlyWarningPolicyMutation: () => ({ mutate, isPending: false }),
}));

import { PolicyDialog } from "./policy-dialog";

describe("PolicyDialog", () => {
  it("groups each signal's watch and at-risk thresholds under the signal's name", () => {
    render(<PolicyDialog open onOpenChange={vi.fn()} />);
    expect(screen.getAllByRole("group")).toHaveLength(7);

    const attendance = screen.getByRole("group", { name: "groups.attendance" });
    expect(within(attendance).getAllByRole("spinbutton")).toHaveLength(2);
    expect(within(attendance).getByText("fields.attendance_watch_rate")).toBeInTheDocument();
    expect(within(attendance).getByText("fields.attendance_at_risk_rate")).toBeInTheDocument();

    const weights = screen.getByRole("group", { name: "groups.weights" });
    expect(within(weights).getAllByRole("spinbutton")).toHaveLength(4);

    // Each group's name is a section heading, not one more field label.
    expect(screen.getByRole("heading", { level: 3, name: "groups.attendance" })).toHaveClass(
      "text-heading",
    );
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(7);

    // The school-day window stands alone, outside every group.
    const window = screen.getByLabelText(/fields\.window_days/);
    expect(window.closest('[role="group"]')).toBeNull();
  });

  it.each([
    [true, "saved"],
    [false, "savedRecomputeLater"],
  ])(
    "says the list was recalculated only when the save rescored it (%s)",
    (recomputed, toastKey) => {
      toast.success.mockReset();
      mutate.mockImplementation(
        (_body: unknown, options: { onSuccess: (saved: unknown) => void }) => {
          options.onSuccess({ recomputed });
        },
      );
      render(<PolicyDialog open onOpenChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "save" }));
      expect(toast.success).toHaveBeenCalledWith(toastKey);
    },
  );
});
