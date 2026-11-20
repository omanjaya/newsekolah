import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), onDone: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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
});
