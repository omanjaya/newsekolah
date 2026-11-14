import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import type { ScannerProps } from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { ClassroomEntryView } from "./classroom-entry-view";

const state = vi.hoisted(() => ({
  profileKind: "student",
  mutateAsync: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("@newsekolah/i18n", () => ({ formatTime: () => "07.12" }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error.${code}`,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { profile_kind: state.profileKind, tenant: { timezone: "Asia/Makassar" } },
  }),
}));
vi.mock("../../permits/api", () => ({
  decodeScanPayload: (code: string) => ({ token: code }),
  useScanClassroomEntryMutation: () => ({ mutateAsync: state.mutateAsync, isPending: false }),
}));
// The real Scanner needs a camera; this stand-in submits one code and shows the result.
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    ...actual,
    Scanner: ({ onScan, result }: ScannerProps) => (
      <div>
        <button
          type="button"
          onClick={() => void onScan({ code: "TOKEN-1", source: "manual", at: 0 })}
        >
          scan
        </button>
        {result && (
          <p role="status">
            {result.title} {result.description}
          </p>
        )}
      </div>
    ),
  };
});

afterEach(() => {
  cleanup();
  state.mutateAsync.mockReset();
  state.profileKind = "student";
});

it("says who the student checked in with after a good scan", async () => {
  state.mutateAsync.mockResolvedValue({
    teacher_name: "Bu Rina",
    scanned_at: "2026-11-14T07:12:00Z",
  });
  const user = userEvent.setup();
  render(<ClassroomEntryView />);

  await user.click(screen.getByRole("button", { name: "scan" }));

  expect(state.mutateAsync).toHaveBeenCalledWith({ token: "TOKEN-1" });
  expect(await screen.findByRole("status")).toHaveTextContent(
    'successTitle successBody:{"teacher":"Bu Rina","time":"07.12"}',
  );
});

it("says why a scan failed", async () => {
  state.mutateAsync.mockRejectedValue(
    new ApiError({ status: 409, code: "TOKEN_EXPIRED", message: "expired" }),
  );
  const user = userEvent.setup();
  render(<ClassroomEntryView />);

  await user.click(screen.getByRole("button", { name: "scan" }));

  expect(await screen.findByRole("status")).toHaveTextContent("errorTitle error.TOKEN_EXPIRED");
});

it("does not offer the scanner to an account that is not a student's", () => {
  state.profileKind = "teacher";
  render(<ClassroomEntryView />);

  expect(screen.getByText("studentsOnlyTitle")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "scan" })).not.toBeInTheDocument();
});
