import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClassLoanBorrowPanel } from "./class-loan-borrow-panel";

const mocks = vi.hoisted(() => ({ canViewClasses: true, useClassesQuery: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canViewClasses,
}));
vi.mock("../../reference/api", () => ({ useClassesQuery: mocks.useClassesQuery }));
vi.mock("../class-loans-api", () => ({
  usePreviewClassLoansMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useCommitClassLoansMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./class-title-picker", () => ({ ClassTitlePicker: () => null }));

describe("ClassLoanBorrowPanel class list", () => {
  beforeEach(() => {
    mocks.useClassesQuery.mockReset();
    mocks.useClassesQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("skips the classes request for a reader without view_academic_data", () => {
    mocks.canViewClasses = false;
    render(<ClassLoanBorrowPanel />);
    expect(mocks.useClassesQuery).toHaveBeenCalledWith(false);
    expect(screen.getByText("classesUnavailable")).toBeInTheDocument();
  });

  it("requests classes for a reader who may view them", () => {
    mocks.canViewClasses = true;
    render(<ClassLoanBorrowPanel />);
    expect(mocks.useClassesQuery).toHaveBeenCalledWith(true);
    expect(screen.queryByText("classesUnavailable")).not.toBeInTheDocument();
  });
});
