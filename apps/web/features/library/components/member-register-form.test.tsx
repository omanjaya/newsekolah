import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({
    data: { data: [{ id: "type-student", name: "Siswa" }] },
    isLoading: false,
  }),
  useRegisterLibraryMemberMutation: () => ({ mutate: mocks.register, isPending: false }),
}));

import { MemberRegisterForm } from "./member-register-form";

beforeEach(() => {
  vi.clearAllMocks();
});

// "Daftarkan" was greyed out on an empty dialog and nothing said why: on
// a phone bottom sheet that was a dead end. Submit now stays enabled and
// pressing it explains what is missing.
describe("MemberRegisterForm", () => {
  it("keeps Daftarkan enabled and names the missing fields when pressed early", async () => {
    const user = userEvent.setup();
    render(<MemberRegisterForm onDone={vi.fn()} />);

    const submit = screen.getByRole("button", { name: "submit" });
    expect(submit).toBeEnabled();
    expect(screen.queryByText("required")).not.toBeInTheDocument();

    await user.click(submit);
    expect(mocks.register).not.toHaveBeenCalled();
    // The member and the member type, each under its own field.
    expect(screen.getAllByText("required")).toHaveLength(2);
  });

  it("clears a field's error once it is filled, and still waits for the rest", async () => {
    const user = userEvent.setup();
    render(<MemberRegisterForm onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(screen.getAllByText("required")).toHaveLength(2);

    await user.click(screen.getByRole("combobox", { name: "userPlaceholder" }));
    expect(screen.getAllByText("required")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(mocks.register).not.toHaveBeenCalled();
  });
});
