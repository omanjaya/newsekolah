import { render, screen } from "@testing-library/react";
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
});
