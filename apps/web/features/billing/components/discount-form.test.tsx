import type * as UiModule from "@newsekolah/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, expect, it, vi } from "vitest";

import { DiscountForm } from "./discount-form";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({ data: { data: [{ id: "student-1", name: "Sari" }] } }),
}));
vi.mock("../api", () => ({
  useCreateDiscountMutation: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateDiscountMutation: () => ({ mutate: mocks.update, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

it("edits percentage basis points without moving the discount or activating an inactive record", async () => {
  const user = userEvent.setup();
  render(
    <DiscountForm
      feeTypeId="fee-1"
      initial={{
        id: "discount-1",
        fee_type_id: "fee-1",
        student_user_id: "student-1",
        kind: "percentage",
        percentage_bp: 1250,
        reason: "Scholarship",
        is_active: false,
      }}
      onDone={vi.fn()}
    />,
  );
  expect(screen.getByRole("spinbutton", { name: "percentage" })).toHaveValue(12.5);
  expect(screen.getByRole("combobox", { name: "student" })).toBeDisabled();
  fireEvent.change(screen.getByRole("spinbutton", { name: "percentage" }), {
    target: { value: "17.25" },
  });
  await user.click(screen.getByRole("button", { name: "submit" }));
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "discount-1",
      fee_type_id: "fee-1",
      student_user_id: "student-1",
      percentage_bp: 1725,
      is_active: false,
    }),
    expect.any(Object),
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
