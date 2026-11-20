import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearSimulation,
  setSimulation,
  syncSimulationIdentity,
} from "../../../lib/simulation/clock";
import type * as AttendanceApiModule from "../api";
import { attendanceListHref } from "../lib/session-save";

import { SessionEditor } from "./session-editor";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
const saveMutateAsync = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
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
const granted = vi.hoisted(() => new Set<string>());
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
  useCan: (permission: string) => granted.has(permission),
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
// The real tabs, journal panel and save bar; only the header and the
// roster, which have suites of their own, are stand-ins.
vi.mock("./session-roster-header", () => ({
  SessionRosterHeader: ({ children, floating }: { children: ReactNode; floating: ReactNode }) => (
    <div>
      {children}
      {floating}
    </div>
  ),
}));
vi.mock("./session-roster-panel", () => ({ SessionRosterPanel: () => null }));

function superadmin() {
  return {
    id: "admin",
    permissions: ["platform_superadmin"],
    tenant: { tenant_id: "school", timezone: "Asia/Jakarta", name: "School", locale: "id" },
  } as unknown as Parameters<typeof syncSimulationIdentity>[0];
}

function session(
  overrides: Partial<AttendanceApiModule.SessionDetail> = {},
): AttendanceApiModule.SessionDetail {
  return {
    id: "sess-1",
    class_id: "c1",
    subject_id: "sub1",
    date: "2026-09-16",
    statuses: [
      { code: "H", label: "Hadir", counts_as_present: true },
      { code: "S", label: "Sakit", counts_as_present: false },
    ],
    roster: [
      { student_user_id: "s1", name: "Siswa Contoh", current_status: "H", notes: "" },
      {
        student_user_id: "s2",
        name: "Siswa Dua",
        current_status: "S",
        source: "leave",
        locked: true,
      },
    ],
    ...overrides,
  } as unknown as AttendanceApiModule.SessionDetail;
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: /^(save|saveCorrection)$/ }));
}

afterEach(() => {
  cleanup();
  clearSimulation();
  syncSimulationIdentity(undefined);
  saveMutateAsync.mockReset();
  for (const fn of Object.values(toast)) fn.mockReset();
  push.mockReset();
});

describe("SessionEditor -- who saves in which mode", () => {
  it("lets the lesson's own teacher re-save a submitted session in normal mode, with no reason", async () => {
    saveMutateAsync.mockResolvedValue(session());
    render(
      <SessionEditor
        session={session({ submitted_at: "2026-09-16T02:00:00Z", save_mode: "normal" })}
        openedInCorrection={false}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "reasonPlaceholder" })).not.toBeInTheDocument();
    clickSave();

    await waitFor(() => {
      expect(saveMutateAsync).toHaveBeenCalledTimes(1);
    });
    const [body] = saveMutateAsync.mock.calls[0] as [{ mode: string; reason?: string }];
    expect(body.mode).toBe("normal");
    expect(body.reason).toBeUndefined();
  });

  it("keeps correction mode for someone correcting another teacher's submitted lesson", () => {
    render(
      <SessionEditor
        session={session({ submitted_at: "2026-09-16T02:00:00Z", save_mode: "correction" })}
        openedInCorrection={false}
      />,
    );

    clickSave();
    expect(saveMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("reasonRequired");
  });

  it("follows save_mode correction for an unsubmitted lesson opened without ?mode=correction", async () => {
    saveMutateAsync.mockResolvedValue(session());
    render(
      <SessionEditor session={session({ save_mode: "correction" })} openedInCorrection={false} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "reasonPlaceholder" }), {
      target: { value: "Wali kelas mengisi" },
    });
    clickSave();

    await waitFor(() => {
      expect(saveMutateAsync).toHaveBeenCalledTimes(1);
    });
    const [body] = saveMutateAsync.mock.calls[0] as [{ mode: string; reason?: string }];
    expect(body.mode).toBe("correction");
    expect(body.reason).toBe("Wali kelas mengisi");
  });
});

describe("SessionEditor -- saving", () => {
  it("returns to the lesson's own day and says whose status a leave letter kept", async () => {
    saveMutateAsync.mockResolvedValue(session({ overridden_student_ids: ["s2"] }));
    render(<SessionEditor session={session()} openedInCorrection={false} />);

    clickSave();

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/attendance?date=2026-09-16");
    });
    expect(toast.warning).toHaveBeenCalledWith('overriddenByLeave {"names":"Siswa Dua"}');
    // The locked row is still sent, with the letter's status.
    const [body] = saveMutateAsync.mock.calls[0] as [
      { entries: { student_user_id: string; status_code: string }[] },
    ];
    expect(body.entries).toContainEqual({ student_user_id: "s2", status_code: "S" });
  });

  it("links today's lesson back to the plain list", () => {
    expect(attendanceListHref("2026-09-16", "2026-09-16")).toBe("/attendance");
    expect(attendanceListHref("2026-09-15", "2026-09-16")).toBe("/attendance?date=2026-09-15");
  });

  it("refuses to save before the lesson starts and says from when it can", () => {
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2026-09-16T00:30:00Z")); // 07.30 in Asia/Jakarta
    render(
      <SessionEditor
        session={session({ starts_at: "2026-09-16T01:00:00Z" })}
        openedInCorrection={false}
      />,
    );

    expect(screen.getByText("notStartedTitle")).toBeInTheDocument();
    expect(screen.getByText(/notStartedBody.*08\.00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("names the day of a lesson on a later day, not only its time", () => {
    syncSimulationIdentity(superadmin());
    // Tuesday 22.30 in Asia/Jakarta, past the lesson's 08.00 on its clock.
    setSimulation("frozen", new Date("2026-09-15T15:30:00Z"));
    render(
      <SessionEditor
        session={session({ starts_at: "2026-09-16T01:00:00Z" })}
        openedInCorrection={false}
      />,
    );

    expect(screen.getByText(/notStartedBodyOnDay/)).toHaveTextContent(
      'notStartedBodyOnDay {"day":"Rabu, 16 Sep","time":"08.00"}',
    );
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });
});

describe("SessionEditor -- a lesson handed to a substitute", () => {
  it("lets its own teacher look but not save", () => {
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2026-09-16T03:00:00Z"));
    render(
      <SessionEditor
        session={session({
          starts_at: "2026-09-16T01:00:00Z",
          save_mode: "correction",
          handed_over_to_user_id: "substitute",
        })}
        openedInCorrection={false}
      />,
    );

    expect(screen.getByText("handedOverTitle")).toBeInTheDocument();
    expect(screen.queryByText("closedTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^(save|saveCorrection)$/ })).toBeDisabled();
  });
});

describe("SessionEditor -- a half-filled journal", () => {
  it("names the missing field and focuses it instead of sending the save", async () => {
    render(
      <SessionEditor
        session={session({ journal_topic: "Persamaan linear" })}
        openedInCorrection={false}
      />,
    );

    clickSave();

    expect(saveMutateAsync).not.toHaveBeenCalled();
    // The journal tab opens; its content only mounts once it is active.
    const activities = await screen.findByRole("textbox", { name: "activities" });
    expect(activities).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => {
      expect(activities).toHaveFocus();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("journalIncomplete");
  });

  it("focuses the missing field when the journal tab is already open", async () => {
    render(<SessionEditor session={session()} openedInCorrection={false} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /tabJournal/ }));
    const activities = await screen.findByRole("textbox", { name: "activities" });
    fireEvent.change(activities, { target: { value: "Latihan soal" } });

    clickSave();

    expect(saveMutateAsync).not.toHaveBeenCalled();
    const topic = screen.getByRole("textbox", { name: "topic" });
    await waitFor(() => {
      expect(topic).toHaveFocus();
    });
  });
});

describe("SessionEditor -- a session whose save window has closed", () => {
  it("says up front that the session is locked and does not offer a save", () => {
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2027-01-12T02:00:00Z")); // 09.00 in Asia/Jakarta
    render(
      <SessionEditor
        session={session({ save_mode: "normal", editable_until: "2027-01-11T16:59:59Z" })}
        openedInCorrection={false}
      />,
    );

    expect(screen.getByText("closedTitle")).toBeInTheDocument();
    // The deadline is the end of the day on the school's clock.
    expect(screen.getByText(/closedBody.*11 Januari 2027.*23\.59/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
    clickSave();
    expect(saveMutateAsync).not.toHaveBeenCalled();
  });

  it("points a reader who sets the correction window at the setting, not at the admin", () => {
    granted.add("manage_settings");
    try {
      syncSimulationIdentity(superadmin());
      setSimulation("frozen", new Date("2027-01-12T02:00:00Z"));
      render(
        <SessionEditor
          session={session({ save_mode: "correction", editable_until: "2027-01-11T16:59:59Z" })}
          openedInCorrection
        />,
      );

      expect(screen.getByText(/closedBodyManager/)).toBeInTheDocument();
      expect(screen.queryByText(/closedBody /)).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "closedSettingsLink" })).toHaveAttribute(
        "href",
        "/settings/attendance",
      );
    } finally {
      granted.delete("manage_settings");
    }
  });

  it("offers no settings link to a reader who cannot change the window", () => {
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2027-01-12T02:00:00Z"));
    render(
      <SessionEditor
        session={session({ save_mode: "normal", editable_until: "2027-01-11T16:59:59Z" })}
        openedInCorrection={false}
      />,
    );

    expect(screen.queryByRole("link", { name: "closedSettingsLink" })).not.toBeInTheDocument();
  });

  it("stays editable while the window is open", () => {
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2027-01-11T10:00:00Z"));
    render(
      <SessionEditor
        session={session({ save_mode: "normal", editable_until: "2027-01-11T16:59:59Z" })}
        openedInCorrection={false}
      />,
    );

    expect(screen.queryByText("closedTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
  });

  it("locks the editor when the server refuses the save for its window, with no retry", async () => {
    saveMutateAsync.mockRejectedValue(
      new ApiError({ status: 409, code: "ATTENDANCE_WINDOW_CLOSED", message: "closed" }),
    );
    render(<SessionEditor session={session()} openedInCorrection={false} />);

    clickSave();

    expect(await screen.findByText("closedTitle")).toBeInTheDocument();
    expect(screen.getByText("ATTENDANCE_WINDOW_CLOSED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("offers a retry only for a failure that could pass on a second try", async () => {
    saveMutateAsync.mockRejectedValueOnce(
      new ApiError({ status: 403, code: "ATTENDANCE_NO_ACCESS", message: "no" }),
    );
    render(<SessionEditor session={session()} openedInCorrection={false} />);
    clickSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("ATTENDANCE_NO_ACCESS");
    expect(screen.queryByRole("button", { name: "retry" })).not.toBeInTheDocument();

    saveMutateAsync.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    clickSave();
    expect(await screen.findByRole("button", { name: "retry" })).toBeInTheDocument();
  });
});
