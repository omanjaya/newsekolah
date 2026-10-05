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
  useUpdateAnnouncementMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

  // getByLabelText can't be used for the body field: its wrapping <label>
  // also contains the "bodyHint" span after the textarea, so the label's
  // computed accessible name is "body bodyHint", not "body" alone.
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
