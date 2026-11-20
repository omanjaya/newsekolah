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
vi.mock("./opac-reserve-action", () => ({
  OpacReserveAction: ({ titleId }: { titleId: string }) => <p>reserve:{titleId}</p>,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));

function detail(
  title: Record<string, unknown>,
  copies: { status: string; access?: string }[] = [],
) {
  return {
    title: { id: "t1", title: "Tempo", classification: "Non-Fiksi - Majalah", ...title },
    copies: copies.map((copy, index) => ({
      barcode: `B-${String(index)}`,
      call_number: "808",
      access: "loanable",
      ...copy,
    })),
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

  it("shows the DDC number beside the classification, and leaves it out when unset", () => {
    query.mockReturnValue({
      data: detail({ ddc_number: "899.2213", language: "ind" }),
      isLoading: false,
      error: null,
    });
    const { unmount } = render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("detail.ddcNumber").nextElementSibling).toHaveTextContent(
      /^899\.2213$/,
    );
    expect(screen.getByText("detail.language").nextElementSibling).toHaveTextContent(/^Indonesia$/);
    unmount();

    query.mockReturnValue({ data: detail({}), isLoading: false, error: null });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.queryByText("detail.ddcNumber")).not.toBeInTheDocument();
  });

  it("keeps the ISBN row for a book with neither identifier", () => {
    query.mockReturnValue({ data: detail({}), isLoading: false, error: null });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("detail.isbn")).toBeInTheDocument();
    expect(screen.queryByText("detail.issn")).not.toBeInTheDocument();
  });

  it("offers a reservation when no copy is on the shelf", () => {
    query.mockReturnValue({
      data: detail({}, [{ status: "on_loan" }, { status: "on_loan" }]),
      isLoading: false,
      error: null,
    });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("detail.noneAvailable")).toBeInTheDocument();
    expect(screen.getByText("reserve:t1")).toBeInTheDocument();
  });

  it("does not claim every copy is on loan when one is held for a reservation", () => {
    query.mockReturnValue({
      data: detail({}, [{ status: "reserved" }]),
      isLoading: false,
      error: null,
    });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("detail.noneOnShelf")).toBeInTheDocument();
    expect(screen.queryByText("detail.noneAvailable")).not.toBeInTheDocument();
  });

  it("offers no reservation while a copy is on the shelf", () => {
    query.mockReturnValue({
      data: detail({}, [{ status: "available" }, { status: "on_loan" }]),
      isLoading: false,
      error: null,
    });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.queryByText("reserve:t1")).not.toBeInTheDocument();
  });

  it("offers a reservation when only a reference copy is on the shelf", () => {
    query.mockReturnValue({
      data: detail({}, [{ status: "available", access: "reference" }, { status: "on_loan" }]),
      isLoading: false,
      error: null,
    });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("reserve:t1")).toBeInTheDocument();
  });

  it("offers no reservation for a title no member could ever borrow", () => {
    query.mockReturnValue({
      data: detail({}, [{ status: "on_loan", access: "read_in_place" }]),
      isLoading: false,
      error: null,
    });
    render(<OpacTitleView titleId="t1" />);
    expect(screen.queryByText("reserve:t1")).not.toBeInTheDocument();
  });
});
