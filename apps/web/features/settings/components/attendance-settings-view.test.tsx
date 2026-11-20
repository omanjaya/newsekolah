import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttendanceSettingsView } from "./attendance-settings-view";

const mutate = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("./settings-page", () => ({
  SettingsPage: ({ children, floating }: { children: ReactNode; floating?: ReactNode }) => (
    <div>
      {children}
      {floating}
    </div>
  ),
}));
vi.mock("../../../lib/navigation/use-unsaved-changes-protection", () => ({
  useUnsavedChangesProtection: () => undefined,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useAttendanceSettingsQuery: () => ({
    data: { correction_days: 7 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateAttendanceSettingsMutation: () => ({ isPending: false, mutate }),
}));

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

describe("AttendanceSettingsView", () => {
  it("shows the school's correction window and saves a longer one", async () => {
    const user = userEvent.setup();
    render(<AttendanceSettingsView />);

    const input = screen.getByRole("spinbutton", { name: /correctionDaysLabel/ });
    expect(input).toHaveValue("7");
    // Nothing to save until the value changes.
    expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "14");
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mutate).toHaveBeenCalledWith({ correction_days: 14 }, expect.anything());
  });

  it("refuses an empty window instead of sending it", async () => {
    const user = userEvent.setup();
    render(<AttendanceSettingsView />);

    const input = screen.getByRole("spinbutton", { name: /correctionDaysLabel/ });
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(screen.getByText(/correctionDaysRangeError/)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
