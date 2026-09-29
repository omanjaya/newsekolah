import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearSimulation,
  setSimulation,
  syncSimulationIdentity,
} from "../../../lib/simulation/clock";
import type * as AttendanceApiModule from "../api";

import { SessionEditor } from "./session-editor";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const saveMutateAsync = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));

vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => toast };
});

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (key: string) => key,
}));

vi.mock("../../../lib/navigation/use-unsaved-changes-protection", () => ({
  useUnsavedChangesProtection: () => undefined,
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));

vi.mock("../../discipline/api", () => ({
  useViolationTypesQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [] } }),
  useSubjectsQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof AttendanceApiModule>("../api");
  return {
    ...actual,
    useSaveEntriesMutation: () => ({ mutateAsync: saveMutateAsync, isPending: false }),
  };
});

// The header, roster, and journal panels have their own tests; this suite
// only cares about `submit()`'s "saved at" toast, so they render as inert
// stand-ins. The save bar keeps a real button so `submit()` can be reached.
vi.mock("./session-roster-header", () => ({ SessionRosterHeader: () => null }));
vi.mock("./session-roster-panel", () => ({ SessionRosterPanel: () => null }));
vi.mock("./session-journal-panel", () => ({ SessionJournalPanel: () => null }));
vi.mock("./session-save-bar", () => ({
  SessionSaveBar: ({ onSave }: { onSave: () => void }) => (
    <button type="button" onClick={onSave}>
      save
    </button>
  ),
}));

function superadmin() {
  return {
    id: "admin",
    permissions: ["platform_superadmin"],
    tenant: { tenant_id: "school", timezone: "Asia/Jakarta", name: "School", locale: "id" },
  } as unknown as Parameters<typeof syncSimulationIdentity>[0];
}

const session: AttendanceApiModule.SessionDetail = {
  id: "sess-1",
  class_id: "c1",
  subject_id: "sub1",
  date: "2026-09-26",
  statuses: [{ code: "H", label: "Hadir", counts_as_present: true }],
  roster: [{ student_user_id: "s1", current_status: "H", notes: "", blocked: false }],
} as unknown as AttendanceApiModule.SessionDetail;

afterEach(() => {
  cleanup();
  clearSimulation();
  syncSimulationIdentity(undefined);
  saveMutateAsync.mockReset();
  toast.success.mockReset();
  push.mockReset();
});

describe("SessionEditor", () => {
  it("reports the simulated business clock, not the real one, in the saved-at toast", async () => {
    saveMutateAsync.mockResolvedValue(session);

    // A frozen simulation reads back exactly this instant regardless of
    // whatever the real wall clock happens to be when the test runs.
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2026-09-26T01:15:00Z")); // 08.15 in Asia/Jakarta

    render(<SessionEditor session={session} openedInCorrection={false} />);

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1);
    });
    const [message] = toast.success.mock.calls[0] as [string];
    expect(message).toContain("08.15");
  });
});
