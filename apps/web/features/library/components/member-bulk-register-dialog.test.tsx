import type * as Ui from "@newsekolah/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MemberBulkRegisterDialog } from "./member-bulk-register-dialog";

const mocks = vi.hoisted(() => ({ canViewClasses: true }));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace === "errors" ? `translated ${key}` : key,
}));

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
      aria-label={placeholder ?? "select"}
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

vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canViewClasses,
}));

const useClassesQuery = vi.hoisted(() => vi.fn());

vi.mock("../../reference/api", () => ({
  useClassesQuery,
}));

const mutate = vi.hoisted(() => vi.fn());

vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({
    data: { data: [{ id: "type-1", name: "Guru" }] },
    isLoading: false,
  }),
  useBulkRegisterLibraryMembersMutation: () => ({ mutate, isPending: false }),
}));

describe("MemberBulkRegisterDialog", () => {
  it("skips the classes request and hides the class filter for a role without view_academic_data", () => {
    mocks.canViewClasses = false;
    useClassesQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<MemberBulkRegisterDialog open={true} onOpenChange={vi.fn()} />);

    expect(useClassesQuery).toHaveBeenCalledWith(false);
    expect(screen.queryByText("class")).not.toBeInTheDocument();
  });

  it("requests classes and shows the class filter for a role that can view them", () => {
    mocks.canViewClasses = true;
    useClassesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });

    render(<MemberBulkRegisterDialog open={true} onOpenChange={vi.fn()} />);

    expect(useClassesQuery).toHaveBeenCalledWith(true);
    expect(screen.getByText("class")).toBeInTheDocument();
  });

  // The dialog stays mounted while closed. Cancel used to skip the reset
  // Escape does, so an empty attempt's errors waited for the next open.
  it("forgets an empty attempt when Cancel closes it", async () => {
    mocks.canViewClasses = false;
    useClassesQuery.mockReturnValue({ data: undefined, isLoading: false });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<MemberBulkRegisterDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(screen.getByText("required")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    rerender(<MemberBulkRegisterDialog open={false} onOpenChange={onOpenChange} />);
    rerender(<MemberBulkRegisterDialog open onOpenChange={onOpenChange} />);

    expect(screen.queryByText("required")).not.toBeInTheDocument();
  });

  it("names each failed user with the translated reason, never the user id", () => {
    mocks.canViewClasses = false;
    useClassesQuery.mockReturnValue({ data: undefined, isLoading: false });
    const failedUserId = "3f0c2b1e-9a4d-4c55-8e7a-1b2c3d4e5f60";
    mutate.mockImplementation(
      (_body: unknown, { onSuccess }: { onSuccess: (data: unknown) => void }) => {
        onSuccess({
          registered: [],
          failed: [
            {
              user_id: failedUserId,
              user_name: "C Citra",
              code: "LIBRARY_MEMBER_NO_EXHAUSTED",
              reason: "library member number generation exhausted",
            },
          ],
        });
      },
    );

    render(<MemberBulkRegisterDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("memberTypePlaceholder"), {
      target: { value: "type-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(screen.getByText("C Citra: translated LIBRARY_MEMBER_NO_EXHAUSTED")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(failedUserId))).not.toBeInTheDocument();
    expect(screen.queryByText(/exhausted$/)).not.toBeInTheDocument();
  });
});
