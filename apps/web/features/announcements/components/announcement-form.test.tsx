import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
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
