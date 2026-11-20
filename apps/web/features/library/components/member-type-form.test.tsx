import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as NextIntl from "next-intl";
import { createTranslator } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import "../../../messages/features";
import { getMessages } from "../../../lib/i18n/get-messages";

const mocks = vi.hoisted(() => ({ create: vi.fn(), onDone: vi.fn() }));

vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof NextIntl>()),
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../members-api", () => ({
  useCreateLibraryMemberTypeMutation: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateLibraryMemberTypeMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MemberTypeForm } from "./member-type-form";

function rejectWith(code: string) {
  mocks.create.mockImplementation((_body: unknown, opts: { onError: (err: unknown) => void }) => {
    opts.onError(new ApiError({ status: 409, code, message: code }));
  });
}

beforeAll(() => {
  // Radix Select needs these, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
});

// A second "Siswa Kelas XII" used to be saved without a word, and the
// pickers then offered two identical options.
describe("MemberTypeForm", () => {
  it("shows a taken name on the name field and keeps the dialog open", async () => {
    rejectWith("LIBRARY_MEMBER_TYPE_NAME_EXISTS");
    const user = userEvent.setup();
    render(<MemberTypeForm memberType={null} onDone={mocks.onDone} />);
    const name = screen.getByRole("textbox", { name: "name" });
    await user.type(name, "Siswa Kelas XII");
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(name).toHaveAccessibleDescription("LIBRARY_MEMBER_TYPE_NAME_EXISTS");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(mocks.onDone).not.toHaveBeenCalled();

    await user.type(name, " B");
    expect(name).not.toHaveAttribute("aria-invalid", "true");
  });

  it("keeps other failures as a form-level message", async () => {
    rejectWith("INTERNAL_ERROR");
    const user = userEvent.setup();
    render(<MemberTypeForm memberType={null} onDone={mocks.onDone} />);
    await user.type(screen.getByRole("textbox", { name: "name" }), "Guru Tamu");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(screen.getByText("INTERNAL_ERROR")).toBeInTheDocument();
  });

  // "Tetap per hari" used to label a fine charged once, however late.
  it("explains the fine type and asks for a period only for a per-period fine", async () => {
    const user = userEvent.setup();
    render(<MemberTypeForm memberType={null} onDone={mocks.onDone} />);

    const fineType = screen.getByRole("combobox", { name: "fineType" });
    expect(fineType).toHaveAccessibleDescription("fineTypeHint.constant");
    expect(screen.queryByRole("spinbutton", { name: "tenorDays" })).not.toBeInTheDocument();

    await user.click(fineType);
    await user.click(await screen.findByRole("option", { name: "fineTypeOptions.per_tenor" }));

    expect(screen.getByRole("combobox", { name: "fineType" })).toHaveAccessibleDescription(
      "fineTypeHint.per_tenor",
    );
    expect(screen.getByRole("spinbutton", { name: "tenorDays" })).toBeInTheDocument();
  });
});

describe("member type fine wording", () => {
  it.each(["id", "en"] as const)("says a flat fine is charged once (%s)", (locale) => {
    const t = createTranslator({
      locale,
      messages: getMessages(locale) as never,
      namespace: "app.library.memberTypes" as never,
    }) as unknown as (key: string, values?: Record<string, unknown>) => string;

    const flat = t("fineValue.constant", { amount: "Rp 500" });
    const perDay = t("fineValue.per_tenor", { amount: "Rp 500", tenor: 1 });
    const perPeriod = t("fineValue.per_tenor", { amount: "Rp 500", tenor: 3 });

    expect(flat).not.toMatch(/per (hari|day)/);
    expect(flat).toMatch(/sekali|once/);
    expect(t("form.fineTypeOptions.constant")).not.toMatch(/per (hari|day)/);
    expect(perDay).toMatch(/Rp 500 per (hari kerja|working day)$/);
    expect(perPeriod).toMatch(/Rp 500 per 3 (hari kerja|working days)$/);
  });
});
