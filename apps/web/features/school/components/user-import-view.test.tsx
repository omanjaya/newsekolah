import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as UserImportLib from "../lib/user-import";

/** Known keys, as next-intl's `has` would see them. */
const KNOWN = new Set([
  "rowError.NAME_REQUIRED",
  "rowError.GENDER_INVALID",
  "rowError.BIRTH_DATE_FORMAT",
  "rowError.ROLE_NOT_FOUND",
  "rowError.unknown",
]);

const mocks = vi.hoisted(() => ({ preview: vi.fn(), commit: vi.fn(), parse: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, params?: Record<string, unknown>) =>
        params && Object.keys(params).length > 0
          ? `${key}:${Object.values(params).join(",")}`
          : key,
      { has: (key: string) => KNOWN.has(key) },
    ),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: (_key: string, initial: unknown) => [initial, vi.fn()],
}));
vi.mock("../lib/user-import", async () => {
  const actual = await vi.importActual<typeof UserImportLib>("../lib/user-import");
  return {
    ...actual,
    parseUserImportFile: mocks.parse,
    downloadUserImportTemplate: vi.fn(),
  };
});
vi.mock("../api", () => ({
  usePreviewImportMutation: () => ({ mutateAsync: mocks.preview, isPending: false }),
  useCommitImportMutation: () => ({ mutateAsync: mocks.commit, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { UserImportView } from "./user-import-view";

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

const rows = [
  { row_number: 2, name: "Budi Santoso", profile_kind: "student", role_slug: "siswa" },
  { row_number: 3, name: "", profile_kind: "student", role_slug: "guru_bk" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parse.mockResolvedValue({ rows });
});

async function upload() {
  const user = userEvent.setup();
  render(<UserImportView />);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  await user.upload(
    input,
    new File(["x"], "pengguna.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  return user;
}

describe("UserImportView preview", () => {
  // The API used to send "errors": null for every clean row; reading
  // `.length` on it replaced the whole page with the error boundary the
  // moment a file with any valid row was chosen, so no import was possible.
  it("previews a file whose clean rows carry errors: null without crashing", async () => {
    mocks.preview.mockResolvedValue({
      data: [
        { row_number: 2, action: "create", username: "budi.santoso", errors: null },
        { row_number: 3, action: "error", errors: [{ code: "NAME_REQUIRED", field: "name" }] },
      ],
    });

    await upload();

    expect(await screen.findByText("reviewTitle", { selector: "h2" })).toBeInTheDocument();
    // The table and its phone cards both carry the row.
    expect(screen.getAllByText("Budi Santoso").length).toBeGreaterThan(0);
    expect(screen.getByText("blockedTitle")).toBeInTheDocument();
  });

  // Row errors arrive as codes and read in the admin's language, never as
  // the API's English sentences; a code this build does not know still
  // says the row is invalid.
  it("translates each coded row error, with its parameters", async () => {
    mocks.preview.mockResolvedValue({
      data: [
        { row_number: 2, action: "create", errors: [] },
        {
          row_number: 3,
          action: "error",
          errors: [
            { code: "NAME_REQUIRED", field: "name" },
            { code: "ROLE_NOT_FOUND", field: "role_slug", params: { role: "guru_bk" } },
            { code: "SOMETHING_NEW", field: "nis" },
          ],
        },
      ],
    });

    await upload();

    expect((await screen.findAllByText("rowError.NAME_REQUIRED")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("rowError.ROLE_NOT_FOUND:guru_bk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("rowError.unknown").length).toBeGreaterThan(0);
    expect(screen.queryByText(/SOMETHING_NEW/)).not.toBeInTheDocument();
  });

  it("offers the commit once every row is clean", async () => {
    mocks.preview.mockResolvedValue({
      data: [
        { row_number: 2, action: "create", errors: [] },
        { row_number: 3, action: "create", errors: [] },
      ],
    });

    await upload();

    expect(await screen.findByText("readyTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "commit" })).toBeEnabled();
  });
});

describe("UserImportView commit", () => {
  // After "Impor sekarang" the heading said "Impor selesai / 2 pengguna
  // berhasil dibuat" while every row and the stat strip still read
  // "Akan dibuat" (will be created). They now say what was done.
  it("labels the committed rows and counts in the past tense", async () => {
    const clean = {
      data: [
        { row_number: 2, action: "create", username: "budi.santoso", errors: [] },
        { row_number: 3, action: "create", username: "siti.rahma", errors: [] },
      ],
    };
    mocks.preview.mockResolvedValue(clean);
    mocks.commit.mockResolvedValue({ created: 2, ...clean });

    const user = await upload();
    expect((await screen.findAllByText("table.action.create")).length).toBeGreaterThan(0);
    expect(screen.getByText("createLabel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "commit" }));

    expect(await screen.findByText("doneTitle")).toBeInTheDocument();
    expect(screen.getByText("doneReviewTitle", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getAllByText("table.done.create").length).toBeGreaterThan(0);
    expect(screen.queryByText("table.action.create")).not.toBeInTheDocument();
    expect(screen.getByText("createdLabel")).toBeInTheDocument();
    expect(screen.queryByText("createLabel")).not.toBeInTheDocument();
  });
});
