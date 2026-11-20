import type * as Ui from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../api", () => ({
  LEAVE_EVIDENCE_MAX_LONG_EDGE: 1600,
  useSubmitLeaveRequestMutation: () => ({ mutateAsync: submit, isPending: false }),
  useUploadEvidenceMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof Ui>();
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
    // A stand-in for the calendar: one button picks a fixed range.
    DateRangePicker: ({ onChange }: { onChange: (range: Ui.DateRange) => void }) => (
      <button
        type="button"
        onClick={() => {
          onChange({ from: "2026-11-23", to: "2026-11-24" });
        }}
      >
        pick-dates
      </button>
    ),
  };
});

import { SubmitForm } from "./leave-request-submit-form";

beforeAll(() => {
  // Radix Select reads pointer-capture and scroll APIs jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  submit.mockReset();
  submit.mockResolvedValue({ instance: { id: "inst-1" } });
});

describe("SubmitForm reason", () => {
  it("does not ask for a reason the letter replaces with the category", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<SubmitForm onDone={onDone} />);

    expect(screen.queryByRole("textbox", { name: /form.reason/ })).not.toBeInTheDocument();
    expect(screen.getByText("form.categoryHint")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "pick-dates" }));
    await user.click(screen.getByRole("button", { name: "form.send" }));

    expect(submit).toHaveBeenCalledWith({
      category: "sick",
      starts_on: "2026-11-23",
      ends_on: "2026-11-24",
    });
    expect(onDone).toHaveBeenCalledWith("inst-1");
  });

  it("requires and sends the student's own reason for Other", async () => {
    const user = userEvent.setup();
    render(<SubmitForm onDone={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: /form.category/ }));
    await user.click(screen.getByRole("option", { name: "categories.other" }));
    await user.click(screen.getByRole("button", { name: "pick-dates" }));
    await user.click(screen.getByRole("button", { name: "form.send" }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText("form.reasonRequired")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /form.reason/ }), "Acara keluarga");
    await user.click(screen.getByRole("button", { name: "form.send" }));

    expect(submit).toHaveBeenCalledWith({
      category: "other",
      reason: "Acara keluarga",
      starts_on: "2026-11-23",
      ends_on: "2026-11-24",
    });
  });
});
