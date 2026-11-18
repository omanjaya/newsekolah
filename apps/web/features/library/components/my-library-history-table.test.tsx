import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LibraryLoan } from "../api";

import { MyLibraryHistoryTable } from "./my-library-history-table";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

  it("leaves a loan that is still out to the current loans, not the history", () => {
    render(
      <MyLibraryHistoryTable
        history={[loan({ title_name: "Fisika", returned_at: undefined })]}
        locale="id"
      />,
    );

    expect(screen.queryByText("Fisika")).not.toBeInTheDocument();
    expect(screen.getByText("noHistory")).toBeInTheDocument();
  });

  it("writes the loan's span as one short line", () => {
    render(
      <MyLibraryHistoryTable
        history={[loan({ title_name: "Kimia", returned_at: "2026-09-10T00:00:00Z" })]}
        locale="id"
        today="2026-11-14"
      />,
    );

    expect(screen.getByText("1 Sep - 10 Sep")).toBeInTheDocument();
  });

  it("caps the table to the 10 most recent loans", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      loan({ id: `loan-${i}`, title_name: `Judul ${i}`, returned_at: "2026-09-10T00:00:00Z" }),
    );
    render(<MyLibraryHistoryTable history={items} locale="id" />);

    expect(screen.getByText("Judul 0")).toBeInTheDocument();
    expect(screen.getByText("Judul 9")).toBeInTheDocument();
    expect(screen.queryByText("Judul 10")).not.toBeInTheDocument();
  });
});
