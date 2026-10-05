import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LibraryLoan } from "../api";

import { MyLibraryHistoryTable } from "./my-library-history-table";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDate: (value: string) => value,
}));

function loan(patch: Partial<LibraryLoan> = {}): LibraryLoan {
  return {
    id: "loan1",
    copy_id: "copy1",
    title_id: "11111111-1111-1111-1111-111111111111",
    member_user_id: "u1",
    borrowed_at: "2026-09-01T00:00:00Z",
    due_on: "2026-09-08",
    renewal_count: 0,
    status: "returned",
    fine_amount: 0,
    ...patch,
  };
}

describe("MyLibraryHistoryTable", () => {
  it("shows the empty message when there is no history", () => {
    render(<MyLibraryHistoryTable history={[]} locale="id" />);

    expect(screen.getByText("noHistory")).toBeInTheDocument();
  });

  it("shows a history row's title text from /v1/library/me, never a raw title id", () => {
    render(
      <MyLibraryHistoryTable
        history={[loan({ title_name: "Matematika Dasar", returned_at: "2026-09-10T00:00:00Z" })]}
        locale="id"
      />,
    );

    expect(screen.getByText("Matematika Dasar")).toBeInTheDocument();
    expect(screen.queryByText("11111111-1111-1111-1111-111111111111")).not.toBeInTheDocument();
  });

  it("shows a dash for the returned date on a loan that was not returned yet", () => {
    render(
      <MyLibraryHistoryTable
        history={[loan({ title_name: "Fisika", returned_at: undefined })]}
        locale="id"
      />,
    );

    const row = screen.getByText("Fisika").closest("tr");
    expect(row?.textContent).toContain("-");
  });

  it("caps the table to the 10 most recent loans", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      loan({ id: `loan-${i}`, title_name: `Judul ${i}` }),
    );
    render(<MyLibraryHistoryTable history={items} locale="id" />);

    expect(screen.getByText("Judul 0")).toBeInTheDocument();
    expect(screen.getByText("Judul 9")).toBeInTheDocument();
    expect(screen.queryByText("Judul 10")).not.toBeInTheDocument();
  });
});
