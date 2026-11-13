import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudentBillHistoryView } from "./student-bill-history-view";

const historyQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("./payment-form", () => ({ PaymentForm: () => null }));
vi.mock("./void-payment-dialog", () => ({ VoidPaymentDialog: () => null }));
vi.mock("../api", () => ({
  useStudentBillHistoryQuery: () => historyQuery() as never,
  usePaymentReceiptUrlMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe("StudentBillHistoryView", () => {
  it("does not claim the student has no bills when the request failed", () => {
    historyQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<StudentBillHistoryView studentId="s1" studentName="Ayu" />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("still shows the empty state for a student who really has no bills", () => {
    historyQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<StudentBillHistoryView studentId="s1" studentName="Ayu" />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });
});
