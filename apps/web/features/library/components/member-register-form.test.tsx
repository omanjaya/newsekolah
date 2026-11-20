import { ApiError } from "@newsekolah/api-client";
import type * as Ui from "@newsekolah/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  memberTypes: [] as { id: string; name: string; default_for_role?: string }[],
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
// Radix Select does not open in jsdom; a native select keeps the form
// drivable while every other ui component stays real.
vi.mock("@newsekolah/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof Ui>()),
  Select: ({
    options,
    value,
    onValueChange,
    placeholder,
  }: {
    options: { value: string; label: string }[];
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <select
      aria-label={placeholder ?? "role"}
      value={value}
      onChange={(e) => {
        onValueChange(e.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({
    data: { data: mocks.memberTypes },
    isLoading: false,
  }),
  useRegisterLibraryMemberMutation: () => ({ mutate: mocks.register, isPending: false }),
}));

import { MemberRegisterForm } from "./member-register-form";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.memberTypes = [{ id: "type-student", name: "Siswa" }];
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

  // The member type settings already say which type is the default for
  // each role; the form used to make the reader pick it again every time.
  describe("member type default", () => {
    beforeEach(() => {
      mocks.memberTypes = [
        { id: "type-student", name: "Siswa", default_for_role: "student" },
        { id: "type-staff", name: "Guru & Staf", default_for_role: "teacher" },
        { id: "type-guest", name: "Tamu" },
      ];
    });

    it("preselects the type that is the default for the chosen role and follows the role", () => {
      render(<MemberRegisterForm onDone={vi.fn()} />);
      const type = screen.getByLabelText("memberTypePlaceholder");
      expect(type).toHaveValue("type-student");

      fireEvent.change(screen.getByLabelText("role"), { target: { value: "teacher" } });
      expect(type).toHaveValue("type-staff");

      // No type is the default for staff: the reader picks one.
      fireEvent.change(screen.getByLabelText("role"), { target: { value: "staff" } });
      expect(type).toHaveValue("");
    });

    it("keeps a type the reader picked when the role changes", () => {
      render(<MemberRegisterForm onDone={vi.fn()} />);
      const type = screen.getByLabelText("memberTypePlaceholder");
      fireEvent.change(type, { target: { value: "type-guest" } });
      fireEvent.change(screen.getByLabelText("role"), { target: { value: "teacher" } });
      expect(type).toHaveValue("type-guest");
    });

    it("submits with the preselected type once a member is picked", async () => {
      const user = userEvent.setup();
      render(<MemberRegisterForm onDone={vi.fn()} />);
      await user.click(screen.getByRole("combobox", { name: "userPlaceholder" }));
      await user.click(screen.getByRole("button", { name: "submit" }));
      expect(mocks.register).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "picked-1", member_type_id: "type-student" }),
        expect.anything(),
      );
    });
  });

  // A taken number and a user who is already a member used to come back
  // as a 500 or as "could not generate a unique number, try again".
  // The API now names the conflict and the form puts it on the field the
  // librarian has to change.
  describe("registration conflicts", () => {
    beforeEach(() => {
      mocks.memberTypes = [{ id: "type-student", name: "Siswa", default_for_role: "student" }];
    });

    function rejectWith(code: string) {
      mocks.register.mockImplementation(
        (_body: unknown, opts: { onError: (err: unknown) => void }) => {
          opts.onError(new ApiError({ status: 409, code, message: code }));
        },
      );
    }

    async function fillAndSubmit(memberNo?: string) {
      const user = userEvent.setup();
      render(<MemberRegisterForm onDone={vi.fn()} />);
      await user.click(screen.getByRole("combobox", { name: "userPlaceholder" }));
      if (memberNo) await user.type(screen.getByPlaceholderText("memberNoPlaceholder"), memberNo);
      await user.click(screen.getByRole("button", { name: "submit" }));
      return user;
    }

    it("shows a taken member number on the member number field and clears it on edit", async () => {
      rejectWith("LIBRARY_MEMBER_NO_COLLISION");
      const user = await fillAndSubmit("LIB-01");
      const input = screen.getByPlaceholderText("memberNoPlaceholder");
      expect(input).toHaveAccessibleDescription("LIBRARY_MEMBER_NO_COLLISION");
      expect(input).toHaveAttribute("aria-invalid", "true");

      await user.type(input, "2");
      expect(screen.queryByText("LIBRARY_MEMBER_NO_COLLISION")).not.toBeInTheDocument();
    });

    it("shows an existing member on the user field", async () => {
      rejectWith("LIBRARY_MEMBER_ALREADY_EXISTS");
      await fillAndSubmit();
      expect(screen.getByText("LIBRARY_MEMBER_ALREADY_EXISTS")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("memberNoPlaceholder")).not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    it("keeps other failures as a form-level message", async () => {
      rejectWith("INTERNAL_ERROR");
      await fillAndSubmit();
      expect(screen.getByText("INTERNAL_ERROR")).toBeInTheDocument();
    });
  });

  it("marks the member number and notes optional through Field, not the label text", () => {
    render(<MemberRegisterForm onDone={vi.fn()} />);
    expect(screen.getByText("memberNo")).toBeInTheDocument();
    expect(screen.getByText("notes")).toBeInTheDocument();
    expect(screen.getAllByText("(opsional)")).toHaveLength(2);
  });
});
