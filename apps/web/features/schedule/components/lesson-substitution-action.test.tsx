import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ScheduleBlock } from "../api";

import { LessonSubstitutionAction } from "./lesson-substitution-action";

const state = vi.hoisted(() => ({ allowed: true, id: "teacher-1", form: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => state.allowed,
  useSession: () => ({ me: { id: state.id, tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/tenant-date", () => ({ todayInZone: () => "2026-09-29" }));
vi.mock("../../substitutions/components/request-form", () => ({ RequestForm: state.form }));
const block = {
  teacher_user_id: "teacher-1",
  schedule_ids: ["schedule-1"],
  day_of_week: 1,
} as ScheduleBlock;
afterEach(cleanup);
beforeEach(() => {
  state.allowed = true;
  state.id = "teacher-1";
  state.form.mockReturnValue(null);
});

it("prefills the same request form with the clicked lesson and its next calendar date", async () => {
  render(<LessonSubstitutionAction block={block} />);
  await userEvent.click(screen.getByRole("button", { name: "requestSubstitute" }));
  expect(state.form).toHaveBeenLastCalledWith(
    expect.objectContaining({ initialScheduleId: "schedule-1", initialDate: "2026-10-05" }),
    undefined,
  );
});

it("does not let a schedule manager request substitutes for somebody else's lesson", () => {
  state.id = "operator";
  render(<LessonSubstitutionAction block={block} />);
  expect(screen.queryByRole("button")).toBeNull();
});

it("requires the original manage attendance permission even for the teacher's own lesson", () => {
  state.allowed = false;
  render(<LessonSubstitutionAction block={block} />);
  expect(screen.queryByRole("button")).toBeNull();
});
