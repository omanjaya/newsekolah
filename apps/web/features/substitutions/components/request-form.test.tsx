import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1", label: "2026/2027" }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { id: "me" } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] } }),
  useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("../../schedule/api", () => ({
  useSchedulesQuery: () => ({
    data: {
      data: [
        { schedule_ids: ["s1"], class_id: "class-1", subject_id: "subject-1", day_of_week: 1 },
      ],
    },
  }),
}));
vi.mock("../api", () => ({
  useCreateSubstitutionMutation: () => ({ mutateAsync: create, isPending: false }),
  useEligibleSubstitutesQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { RequestForm } from "./request-form";

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
afterEach(cleanup);

it("marks the lesson, date and substitute as required up front", () => {
  render(<RequestForm onDone={vi.fn()} />);

  for (const name of ["schedule", "date"]) {
    expect(screen.getByRole("combobox", { name })).toHaveAttribute("aria-required", "true");
  }
  // The substitute picker's trigger is a button, which says it is required
  // in its description instead.
  expect(screen.getByRole("button", { name: "substitute" })).toHaveAttribute("aria-describedby");
});

it("shows each missing field's own error on Send and focuses the first, with no banner", async () => {
  const user = userEvent.setup();
  render(<RequestForm onDone={vi.fn()} initialScheduleId="s1" />);

  await user.click(screen.getByRole("button", { name: "send" }));

  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  // The lesson was given; the date and the substitute were not.
  expect(screen.getByRole("combobox", { name: "schedule" })).not.toHaveAttribute("aria-invalid");
  const date = screen.getByRole("combobox", { name: "date" });
  expect(date).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "substitute" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await waitFor(() => {
    expect(date).toHaveFocus();
  });
});
