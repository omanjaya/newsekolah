import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import id from "../../messages/id.json";

import type { ScheduleBlock, ScheduleHold } from "./api";
import { type BlockLock, useBlockLock } from "./use-block-lock";

function block(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    schedule_ids: ["schedule-1"],
    class_id: "class-1",
    subject_id: "subject-1",
    teacher_user_id: "teacher-1",
    day_of_week: 4,
    start_seq: 1,
    end_seq: 2,
    source: "admin",
    effective_from: "2026-11-26",
    effective_until: "2026-11-26",
    ...overrides,
  };
}

/** A lesson whose every remaining date has history, held there by `hold`. */
function boundBy(hold?: ScheduleHold): ScheduleBlock {
  return block({
    has_history: true,
    mutation_policy: {
      can_edit: false,
      can_delete: false,
      has_history: true,
      reason: "SCHEDULE_CHANGE_BEFORE_HISTORY",
      held_by: hold,
    },
  });
}

const request: ScheduleHold = {
  kind: "substitution",
  id: "request-1",
  date: "2026-11-26",
  status: "pending",
};

function lockIn(locale: "id" | "en", target: ScheduleBlock): BlockLock | undefined {
  const messages = locale === "id" ? id : en;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider
      locale={locale}
      messages={{ app: { schedule: messages.app.schedule } }}
      timeZone="Asia/Makassar"
      onError={(error) => {
        throw error;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
  const { result } = renderHook(() => useBlockLock(), { wrapper });
  return result.current(target);
}

describe("useBlockLock", () => {
  it("names the pending request that holds a locked lesson, and links to where it is cancelled", () => {
    expect(lockIn("id", boundBy(request))).toEqual({
      reason:
        "semua pertemuan tersisa sudah punya riwayat, ditahan oleh permintaan guru pengganti untuk Kam, 26 Nov yang menunggu jawaban; batalkan permintaan itu agar jadwal ini bisa diubah",
      shortReason: "semua pertemuan tersisa sudah punya riwayat",
      link: {
        href: "/substitutions?view=all",
        label: "Lihat permintaan guru pengganti untuk Kam, 26 Nov",
        page: "substitutions",
      },
    });
    expect(lockIn("en", boundBy({ ...request, status: "accepted" }))?.reason).toBe(
      "every remaining lesson already has history, held by an accepted substitution on Thu, Nov 26; cancel that substitution to change this lesson",
    );
  });

  // The link opened that day's attendance, which for a manager with no
  // teacher picked said nothing was recorded that day: it now opens the
  // session that holds the lesson.
  it("links a recorded session to the session itself, and a visit to nothing", () => {
    const session = lockIn("id", boundBy({ kind: "attendance", id: "s-1", date: "2026-11-26" }));
    expect(session?.reason).toBe(
      "semua pertemuan tersisa sudah punya riwayat, ditahan oleh presensi yang tercatat pada Kam, 26 Nov",
    );
    expect(session?.link).toEqual({
      href: "/attendance/s-1",
      label: "Buka presensi Kam, 26 Nov",
      page: "attendance",
    });
    const visit = lockIn("en", boundBy({ kind: "supervision", id: "v-1", date: "2026-11-26" }));
    expect(visit?.reason).toBe(
      "every remaining lesson already has history, held by a supervision visit planned for Thu, Nov 26",
    );
    expect(visit?.link).toBeUndefined();
  });

  it("keeps the plain reason without one record, and for a lesson that has ended", () => {
    expect(lockIn("id", boundBy())).toEqual({
      reason: "semua pertemuan tersisa sudah punya riwayat",
      shortReason: "semua pertemuan tersisa sudah punya riwayat",
    });
    const ended = block({
      mutation_policy: { can_edit: false, can_delete: false, reason: "SCHEDULE_ENDED" },
    });
    expect(lockIn("id", ended)?.reason).toBe("jadwal ini sudah tidak berlaku");
  });

  it("has nothing to say about a lesson the editor can change", () => {
    const open = block({
      mutation_policy: {
        can_edit: true,
        can_delete: true,
        has_history: true,
        requires_effective_from: true,
        min_effective_from: "2026-11-27",
        held_by: request,
      },
    });
    expect(lockIn("id", open)).toBeUndefined();
    expect(lockIn("id", block())).toBeUndefined();
  });
});
