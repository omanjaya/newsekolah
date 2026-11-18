import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "5f2c9a10-0000-4000-8000-000000000001", name: "Ayu Lestari" }]);
});
vi.mock("./student-bill-history-view", () => ({
  StudentBillHistoryView: ({
    studentId,
    studentName,
  }: {
    studentId: string;
    studentName: string;
  }) => (
    <p data-testid="history">
      {studentId}: {studentName}
    </p>
  ),
}));

import { PaymentDeskView } from "./payment-desk-view";

describe("PaymentDeskView", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/billing?tab=desk");
  });

  it("asks for a student first", () => {
    render(<PaymentDeskView />);
    expect(screen.getByText("pickStudentTitle")).toBeInTheDocument();
    expect(screen.queryByTestId("history")).not.toBeInTheDocument();
  });

  it("opens the student named in the URL, so a refresh or a link lands on them", () => {
    window.history.replaceState(
      null,
      "",
      "/billing?tab=desk&student=5f2c9a10-0000-4000-8000-000000000001",
    );
    render(<PaymentDeskView />);
    expect(screen.getByTestId("history")).toHaveTextContent(
      "5f2c9a10-0000-4000-8000-000000000001: Ayu Lestari",
    );
  });

  it("keeps the picked student in the URL", async () => {
    const user = userEvent.setup();
    render(<PaymentDeskView />);
    await user.click(screen.getByRole("combobox", { name: "pickStudentPlaceholder" }));
    expect(new URLSearchParams(window.location.search).get("student")).toBe("picked-1");
    expect(screen.getByTestId("history")).toHaveTextContent("picked-1: Picked Person");
  });
});
