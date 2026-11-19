import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MemberBulkRegisterDialog } from "./member-bulk-register-dialog";

const mocks = vi.hoisted(() => ({ canViewClasses: true }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canViewClasses,
}));

const useClassesQuery = vi.hoisted(() => vi.fn());

vi.mock("../../reference/api", () => ({
  useClassesQuery,
}));

vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({ data: { data: [] }, isLoading: false }),
  useBulkRegisterLibraryMembersMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("MemberBulkRegisterDialog", () => {
  it("skips the classes request and hides the class filter for a role without view_academic_data", () => {
    mocks.canViewClasses = false;
    useClassesQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<MemberBulkRegisterDialog open={true} onOpenChange={vi.fn()} />);

    expect(useClassesQuery).toHaveBeenCalledWith(false);
    expect(screen.queryByText("classOptional")).not.toBeInTheDocument();
  });

  it("requests classes and shows the class filter for a role that can view them", () => {
    mocks.canViewClasses = true;
    useClassesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });

    render(<MemberBulkRegisterDialog open={true} onOpenChange={vi.fn()} />);

    expect(useClassesQuery).toHaveBeenCalledWith(true);
    expect(screen.getByText("classOptional")).toBeInTheDocument();
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
});
