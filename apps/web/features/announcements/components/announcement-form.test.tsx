import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { AnnouncementForm } from "./announcement-form";

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

const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [] } }),
}));
vi.mock("../api", () => ({
  useCreateAnnouncementMutation: () => ({
    mutateAsync: create,
    isPending: false,
  }),
  useUpdateAnnouncementMutation: () => ({ mutateAsync: update, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "new-1" });
});
afterEach(cleanup);

it("groups the editor into content, audience and schedule sections", () => {
  render(<AnnouncementForm onSaved={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByText("sectionContent")).toBeInTheDocument();
  expect(screen.getByText("sectionAudience")).toBeInTheDocument();
  expect(screen.getByText("sectionSchedule")).toBeInTheDocument();
});

it("gives each date and time pair of the schedule a row of its own", () => {
  render(<AnnouncementForm onSaved={vi.fn()} onCancel={vi.fn()} />);
  const section = screen.getByRole("region", { name: "sectionSchedule" });
  // Two pairs in one row left the time picker too narrow for "Pilih jam".
  const grid = section.querySelector(":scope > div:last-child");
  expect(grid).not.toHaveClass("@lg:grid-cols-2");
  // On a phone the date and time of a pair stack, each the full width.
  const pair = screen.getByRole("group", { name: "startsAt" });
  expect(pair).toHaveClass("grid-cols-1", "sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]");
});

it("still creates a draft from the restructured compose tab", async () => {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<AnnouncementForm onSaved={onSaved} onCancel={vi.fn()} />);

  // Found by role and tag rather than by label, so the test stays about
  // saving a draft and not about how the fields are labelled.
  const textboxes = screen.getAllByRole("textbox");
  const titleInput = textboxes.find((el) => el.tagName === "INPUT");
  const bodyInput = textboxes.find((el) => el.tagName === "TEXTAREA");
  if (!titleInput || !bodyInput) {
    throw new Error("expected a title input and a body textarea");
  }
  await user.type(titleInput, "Judul baru");
  await user.type(bodyInput, "Isi pengumuman");
  await user.click(screen.getByRole("button", { name: "saveDraft" }));

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Judul baru", body_html: "<p>Isi pengumuman</p>" }),
  );
  expect(onSaved).toHaveBeenCalledWith({ id: "new-1" });
});

it("shows and saves the schedule on the school's clock, not the device's", async () => {
  update.mockResolvedValue({ id: "a1" });
  const user = userEvent.setup();
  render(
    <AnnouncementForm
      initial={{
        id: "a1",
        title: "Rapat",
        body_html: "<p>Isi</p>",
        body_text: "Isi",
        audience: { type: "all" },
        is_pinned: false,
        status: "scheduled",
        // 06:30 on 20 November in Asia/Jakarta (the mocked school zone).
        starts_at: "2026-11-19T23:30:00Z",
        recipient_count: 0,
        created_at: "2026-11-01T00:00:00Z",
      }}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByDisplayValue(/^06[.:]30$/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "saveChanges" }));
  const [vars] = update.mock.calls[0] as [{ id: string; body: { starts_at?: string } }];
  expect(vars.id).toBe("a1");
  expect(vars.body.starts_at).toBe("2026-11-19T23:30:00.000Z");
});

it("marks a missing title and body on their own fields and focuses the first", async () => {
  const user = userEvent.setup();
  render(<AnnouncementForm onSaved={vi.fn()} onCancel={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "saveDraft" }));

  expect(create).not.toHaveBeenCalled();
  // No banner for what a field can say itself.
  expect(screen.queryByText("requiredError")).not.toBeInTheDocument();
  const title = screen.getByRole("textbox", { name: /title/ });
  const body = screen.getByRole("textbox", { name: /body/ });
  expect(title).toHaveAttribute("aria-invalid", "true");
  expect(body).toHaveAttribute("aria-invalid", "true");
  expect(title).toHaveAttribute("aria-required", "true");
  expect(title).toHaveFocus();

  await user.type(title, "Judul");
  expect(title).not.toHaveAttribute("aria-invalid");
  expect(body).toHaveAttribute("aria-invalid", "true");
});

it("focuses the title once the compose tab is back after a submit from the preview", async () => {
  const user = userEvent.setup();
  render(<AnnouncementForm onSaved={vi.fn()} onCancel={vi.fn()} />);

  await user.click(screen.getByRole("tab", { name: "tabPreview" }));
  await user.click(screen.getByRole("button", { name: "saveDraft" }));

  expect(create).not.toHaveBeenCalled();
  expect(screen.getByRole("tab", { name: "tabCompose" })).toHaveAttribute("aria-selected", "true");
  const title = await screen.findByRole("textbox", { name: /title/ });
  await vi.waitFor(() => {
    expect(title).toHaveFocus();
  });
});

it("marks an empty audience on the audience picker, not in a banner", async () => {
  const user = userEvent.setup();
  render(
    <AnnouncementForm
      initial={{
        id: "a1",
        title: "Rapat",
        body_html: "<p>Isi</p>",
        body_text: "Isi",
        audience: { type: "roles", role_slugs: [] },
        is_pinned: false,
        status: "draft",
        recipient_count: 0,
        created_at: "2026-11-01T00:00:00Z",
      }}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "saveChanges" }));

  expect(update).not.toHaveBeenCalled();
  const group = screen.getByRole("group", { name: /audienceRoles/ });
  expect(group).toHaveAccessibleDescription("audienceError");
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes[0]).toHaveAttribute("aria-invalid", "true");
  expect(boxes[0]).toHaveFocus();
});

const SAVED = {
  id: "a1",
  title: "Upacara",
  body_html:
    "<p>Seluruh warga sekolah wajib hadir.</p><p>Pakaian: seragam putih abu-abu.<br>Bawa topi.</p>",
  // The flattened copy older rows still carry; the editor must not use it.
  body_text: "Seluruh warga sekolah wajib hadir.Pakaian: seragam putih abu-abu.Bawa topi.",
  audience: { type: "all" as const },
  is_pinned: false,
  status: "draft" as const,
  recipient_count: 0,
  created_at: "2026-11-01T00:00:00Z",
};

it("opens a saved announcement with its paragraphs and lines, and saving it unchanged keeps them", async () => {
  update.mockResolvedValue({ id: "a1" });
  const user = userEvent.setup();
  render(<AnnouncementForm initial={SAVED} onSaved={vi.fn()} onCancel={vi.fn()} />);

  expect(screen.getByRole("textbox", { name: /body/ })).toHaveValue(
    "Seluruh warga sekolah wajib hadir.\n\nPakaian: seragam putih abu-abu.\nBawa topi.",
  );

  await user.click(screen.getByRole("button", { name: "saveChanges" }));
  const [vars] = update.mock.calls[0] as [{ body: { body_html: string } }];
  expect(vars.body.body_html).toBe(SAVED.body_html);
});

it("marks an end before the start on the end field and focuses it, even from the preview tab", async () => {
  update.mockReset();
  const user = userEvent.setup();
  render(
    <AnnouncementForm
      initial={{
        ...SAVED,
        // 25 and 22 November, 07:00 in Asia/Jakarta.
        starts_at: "2026-11-25T00:00:00Z",
        ends_at: "2026-11-22T00:00:00Z",
      }}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  // Submitting from the preview: the compose tab, where the field lives,
  // is hidden until the form switches back to it.
  await user.click(screen.getByRole("tab", { name: "tabPreview" }));
  await user.click(screen.getByRole("button", { name: "saveChanges" }));

  expect(update).not.toHaveBeenCalled();
  const group = await screen.findByRole("group", { name: "endsAt" });
  expect(group).toHaveAccessibleDescription("endsBeforeStart");
  const [datePicker] = within(group).getAllByRole("combobox");
  expect(datePicker).toHaveAttribute("aria-invalid", "true");
  await vi.waitFor(() => {
    expect(datePicker).toHaveFocus();
  });
  // No banner for what the field says itself.
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("puts the server's ends_at answer on the end field instead of a generic banner", async () => {
  update.mockReset();
  update.mockRejectedValue(
    new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "x",
      details: [{ field: "ends_at", code: "BEFORE_START" }],
    }),
  );
  const user = userEvent.setup();
  render(<AnnouncementForm initial={SAVED} onSaved={vi.fn()} onCancel={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "saveChanges" }));

  const group = await screen.findByRole("group", { name: "endsAt" });
  await vi.waitFor(() => {
    expect(group).toHaveAccessibleDescription("endsBeforeStart");
  });
  expect(screen.queryByText("VALIDATION_FAILED")).not.toBeInTheDocument();
});
