import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OpacTitleView } from "./opac-title-view";

interface QueryState {
  data?: unknown;
  isLoading: boolean;
  error: unknown;
}

const query = vi.hoisted(() => vi.fn<() => QueryState>());

vi.mock("../opac-api", () => ({ useOpacTitleQuery: query }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));

function detail(title: Record<string, unknown>) {
  return {
    title: { id: "t1", title: "Tempo", classification: "Non-Fiksi - Majalah", ...title },
    copies: [],
  };
}

describe("OpacTitleView", () => {
  it("gives the not-found state the page heading", () => {
    query.mockReturnValue({ data: undefined, isLoading: false, error: new Error("404") });
    render(<OpacTitleView titleId="missing" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "detail.notFoundTitle" }),
    ).toBeInTheDocument();
  });

  it("shows a serial's ISSN and no empty ISBN row", () => {
    query.mockReturnValue({
      data: detail({ issn: "0126-4273" }),
      isLoading: false,
      error: null,
    });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("detail.issn")).toBeInTheDocument();
    expect(screen.getByText("0126-4273")).toBeInTheDocument();
    expect(screen.queryByText("detail.isbn")).not.toBeInTheDocument();
  });

  it("shows both identifiers when a title has both", () => {
    query.mockReturnValue({
      data: detail({ isbn: "9990000000048", issn: "0126-4273" }),
      isLoading: false,
      error: null,
    });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("9990000000048")).toBeInTheDocument();
    expect(screen.getByText("0126-4273")).toBeInTheDocument();
  });

  it("keeps the ISBN row for a book with neither identifier", () => {
    query.mockReturnValue({ data: detail({}), isLoading: false, error: null });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("detail.isbn")).toBeInTheDocument();
    expect(screen.queryByText("detail.issn")).not.toBeInTheDocument();
  });
});
