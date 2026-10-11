import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ checkIn: vi.fn(), createGuest: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../api", () => ({
  useCheckInVisitMutation: () => ({ mutate: mocks.checkIn, isPending: false }),
  useCreateExpectedGuestMutation: () => ({ mutate: mocks.createGuest, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { CheckInForm } from "./check-in-form";
import { ExpectedGuestForm } from "./expected-guest-form";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("visitor host pickers", () => {
  it("searches teachers and staff, not students, to pick who is visited at check-in", async () => {
    const user = userEvent.setup();
    render(<CheckInForm defaultFullName="Tamu" onDone={vi.fn()} />);

    const picker = screen.getByRole("combobox", { name: "hostPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "teacher,staff");
    await user.click(picker);
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ host_user_id: "picked-1" }),
      expect.any(Object),
    );
  });

  it("keeps the host of an expected guest when checking them in", () => {
    render(<CheckInForm defaultFullName="Tamu" defaultHostUserId="host-3" onDone={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "hostPlaceholder" })).toHaveAttribute(
      "data-value",
      "host-3",
    );
  });

  it("registers an expected guest with the picked host", async () => {
    const user = userEvent.setup();
    render(<ExpectedGuestForm defaultDate="2026-10-10" onDone={vi.fn()} />);

    const picker = screen.getByRole("combobox", { name: "hostPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "teacher,staff");
    await user.type(screen.getByRole("textbox", { name: "fullName" }), "Bu Ani");
    await user.click(picker);
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.createGuest).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: "Bu Ani", host_user_id: "picked-1" }),
      expect.any(Object),
    );
  });
});
