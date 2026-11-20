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
  "field.name",
  "field.guardian_phone",
]);

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  commit: vi.fn(),
  parse: vi.fn(),
  toastSuccess: vi.fn(),
}));

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
  return { ...actual, useToast: () => ({ success: mocks.toastSuccess, error: vi.fn() }) };
});

import { UserImportView } from "./user-import-view";

beforeAll(() => {
  // Radix Select (the import mode) reads pointer-capture and scroll APIs
  // jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
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

async function upload(mode?: "upsert") {
  const user = userEvent.setup();
  render(<UserImportView />);
  if (mode === "upsert") {
    await user.click(screen.getByRole("combobox", { name: "mode.label" }));
    await user.click(screen.getByRole("option", { name: "mode.upsert" }));
  }
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

describe("UserImportView upsert", () => {
  const upsertResults = {
    data: [
      {
        row_number: 2,
        action: "update",
        username: "budi.santoso",
        changed_fields: ["name", "guardian_phone", "brand_new_column"],
        errors: [],
      },
      { row_number: 3, action: "unchanged", username: "siti.rahma", errors: [] },
    ],
  };

  // The API names changed fields by their template column identifier; the
  // row used to read "Berubah: name, guardian_phone". Each one now reads as
  // a field label, and an identifier this build does not know is kept.
  it("labels each changed field instead of showing the API identifier", async () => {
    mocks.preview.mockResolvedValue(upsertResults);

    await upload("upsert");

    expect(
      (
        await screen.findAllByText(
          "table.changedFields:field.name, field.guardian_phone, brand_new_column",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/changedFields:name/)).not.toBeInTheDocument();
  });

  // Re-importing two existing users (one renamed, one as it was) toasted
  // "2 pengguna berhasil dibuat" from the uploaded row count while the
  // alert beside it said 0 created, 1 updated, 1 unchanged.
  it("toasts what the commit did, not the uploaded row count", async () => {
    mocks.preview.mockResolvedValue(upsertResults);
    mocks.commit.mockResolvedValue(upsertResults);

    const user = await upload("upsert");
    await user.click(await screen.findByRole("button", { name: "commit" }));

    expect(await screen.findByText("doneBodyUpsert:0,1,1")).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("committedUpsert:0,1,1");
  });

  it("toasts the created count in create-only mode", async () => {
    const clean = {
      data: [
        { row_number: 2, action: "create", username: "budi.santoso", errors: [] },
        { row_number: 3, action: "create", username: "siti.rahma", errors: [] },
      ],
    };
    mocks.preview.mockResolvedValue(clean);
    mocks.commit.mockResolvedValue(clean);

    const user = await upload();
    await user.click(await screen.findByRole("button", { name: "commit" }));

    expect(await screen.findByText("doneTitle")).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("committed:2");
  });
});
