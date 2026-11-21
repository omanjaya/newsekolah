import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import id from "../../messages/id.json";

import type { ScheduleBlock } from "./api";
import { useEffectiveCaption } from "./use-effective-caption";

const WEEK = "2026-11-23";

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
    effective_from: "2026-07-13",
    ...overrides,
  };
}

function captionIn(locale: "id" | "en", target: ScheduleBlock): string | undefined {
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
  const { result } = renderHook(() => useEffectiveCaption(WEEK), { wrapper });
  return result.current(target);
}

describe("useEffectiveCaption", () => {
  it("says a lesson kept on one date of the week happens only then", () => {
    const kept = block({ effective_from: "2026-11-26", effective_until: "2026-11-26" });
    expect(captionIn("id", kept)).toBe("Hanya Kam, 26 Nov");
    expect(captionIn("en", kept)).toBe("Only Thu, Nov 26");
  });

  it("still names only the start or only the end when one bound is in the week", () => {
    expect(captionIn("id", block({ effective_from: "2026-11-26" }))).toBe("Mulai Kam, 26 Nov");
    expect(captionIn("id", block({ effective_until: "2026-11-26" }))).toBe("Sampai Kam, 26 Nov");
  });

  it("draws nothing under a block that covers the week", () => {
    expect(captionIn("id", block())).toBeUndefined();
  });
});
