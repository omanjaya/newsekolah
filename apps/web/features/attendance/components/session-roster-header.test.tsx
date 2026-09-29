import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SessionDetail } from "../api";

import { SessionRosterHeader } from "./session-roster-header";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations:
    (namespace: string) => (key: string, params?: Record<string, string | number>) => {
      if (namespace === "app.attendance.editor" && key === "timeRange") {
        return `Jam ${params?.start}-${params?.end}`;
      }
      const table: Record<string, string> = {
        backToList: "Kembali ke daftar presensi",
        back: "Presensi",
        eyebrow: `Pertemuan ke-${params?.meeting}`,
        correctionMode: "Mode koreksi",
        markAllPresent: "Tandai semua hadir",
        resetChanges: "Kosongkan perubahan",
        markAllPresentHint: "Status Sakit, Izin, dan Dispensasi tidak ditimpa.",
        title: "Presensi",
      };
      return table[key] ?? key;
    },
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDate: () => "25 September 2026",
}));

vi.mock("../../reference/api", () => ({
  useAllPeriodsQuery: () => ({
    data: {
      data: [
        { id: "p1", name: "Jam ke-1", starts_at: "07:00:00", ends_at: "07:45:00" },
        { id: "p2", name: "Jam ke-2", starts_at: "07:45:00", ends_at: "08:30:00" },
      ],
    },
  }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));

function session(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: "s1",
    class_id: "c1",
    subject_id: "sub1",
    date: "2026-09-25",
    meeting_number: 4,
    start_period_id: "p1",
    end_period_id: "p2",
    statuses: [],
    roster: [],
    ...overrides,
  } as SessionDetail;
}

describe("SessionRosterHeader", () => {
  it("titles the page 'Subject · Class' and shows the date and time range", () => {
    render(
      <SessionRosterHeader
        session={session()}
        className="X IPA 1"
        subjectName="Matematika"
        isCorrection={false}
        onMarkAllPresent={() => undefined}
        onResetChanges={() => undefined}
        canReset={false}
        disabled={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "Matematika · X IPA 1" })).toBeInTheDocument();
    expect(screen.getByText(/25 September 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Jam 07:00-08:30/)).toBeInTheDocument();
    expect(
      screen.getByText("Status Sakit, Izin, dan Dispensasi tidak ditimpa."),
    ).toBeInTheDocument();
  });

  it("triggers mark-all-present and reset from the header's pill buttons", async () => {
    const onMarkAllPresent = vi.fn();
    const onResetChanges = vi.fn();
    render(
      <SessionRosterHeader
        session={session()}
        className="X IPA 1"
        subjectName="Matematika"
        isCorrection={false}
        onMarkAllPresent={onMarkAllPresent}
        onResetChanges={onResetChanges}
        canReset={true}
        disabled={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Tandai semua hadir/ }));
    await userEvent.click(screen.getByRole("button", { name: /Kosongkan perubahan/ }));
    expect(onMarkAllPresent).toHaveBeenCalledTimes(1);
    expect(onResetChanges).toHaveBeenCalledTimes(1);
  });

  it("disables reset when there is nothing to reset", () => {
    render(
      <SessionRosterHeader
        session={session()}
        className="X IPA 1"
        subjectName="Matematika"
        isCorrection={false}
        onMarkAllPresent={() => undefined}
        onResetChanges={() => undefined}
        canReset={false}
        disabled={false}
      />,
    );
    expect(screen.getByRole("button", { name: /Kosongkan perubahan/ })).toBeDisabled();
  });
});
