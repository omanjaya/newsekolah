import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DutyAssignment } from "../api";

import { EndDutyAssignmentDialog } from "./end-duty-assignment-dialog";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../duties-api", () => ({
  useUpdateDutyAssignmentMutation: () => ({ mutate: mocks.mutate, isPending: false }),
}));

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function assignment(startsOn: string): DutyAssignment {
  return {
    id: "a1",
    user_id: "u1",
    duty_name: "Guru Piket",
    starts_on: startsOn,
    is_active: true,
  } as DutyAssignment;
}

describe("EndDutyAssignmentDialog", () => {
  it("defaults the end date to the start date of an assignment that starts later", async () => {
    const user = userEvent.setup();
    render(<EndDutyAssignmentDialog assignment={assignment("2999-02-01")} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "end" }));
    // Today would be before the start: the picker refuses it and the API
    // answered it with VALIDATION_FAILED, so the dialog never sends it.
    expect(mocks.mutate).toHaveBeenCalledWith(
      { id: "a1", body: { is_active: false, ends_on: "2999-02-01" } },
      expect.anything(),
    );
  });

  it("defaults to today for an assignment that already started", async () => {
    const user = userEvent.setup();
    render(<EndDutyAssignmentDialog assignment={assignment("2020-01-01")} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "end" }));
    const sent = mocks.mutate.mock.calls[0]?.[0] as { body: { ends_on: string } };
    expect(sent.body.ends_on > "2020-01-01").toBe(true);
  });
});
