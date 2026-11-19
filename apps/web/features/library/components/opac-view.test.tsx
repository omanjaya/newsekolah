import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setDocumentSchoolName } from "../../../lib/page-title";

import { OpacView } from "./opac-view";

interface Title {
  id: string;
  title: string;
  author: string;
  publisher?: string;
  classification: string;
  publish_year?: number;
  available_copies: number;
  total_copies: number;
}

function title(index: number, overrides: Partial<Title> = {}): Title {
  return {
    id: `t${index}`,
    title: `Judul ${index}`,
    author: `Penulis ${index}`,
    classification: index % 2 ? "Fiksi - Novel" : "Non-Fiksi - Sejarah",
    publish_year: 2000 + index,
    available_copies: 1,
    total_copies: 2,
    ...overrides,
  };
}

interface QueryState {
  data?: { data: Title[]; library_name: string };
  isError?: boolean;
  isPending?: boolean;
}

const results = vi.fn<(search: string, options: { classificationPrefix?: string }) => QueryState>();
const refetch = vi.fn();

vi.mock("../opac-api", () => ({
  useOpacTitlesQuery: (search: string, options: { classificationPrefix?: string } = {}) => ({
    isError: false,
    isPending: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch,
    ...results(search, options),
  }),
  useOpacHighlightsQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));

const CATALOGUE = [title(1), title(2), title(3)];

function catalogue(state: QueryState = {}) {
  results.mockImplementation((search, options) =>
    search === "" && !options.classificationPrefix
      ? { data: { data: CATALOGUE, library_name: "Perpustakaan" } }
      : { data: { data: CATALOGUE.slice(0, 1), library_name: "Perpustakaan" }, ...state },
  );
}

describe("OpacView", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/opac");
    results.mockReset();
    refetch.mockReset();
    catalogue();
  });

  it("lists the titles with their availability and the library's name", () => {
    render(<OpacView />);
    expect(screen.getByRole("heading", { level: 1, name: "title" })).toBeInTheDocument();
    expect(screen.getByText("Perpustakaan")).toBeInTheDocument();
    expect(screen.getByText("resultCount 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Judul 1" })).toHaveAttribute("href", "/opac/t1");
  });

  it("names the publisher for a title without an author, so the year never stands alone", () => {
    results.mockReturnValue({
      data: {
        data: [title(1, { author: "", publisher: "Tempo Inti Media", publish_year: 2026 })],
        library_name: "Perpustakaan",
      },
    });
    render(<OpacView />);
    expect(screen.getAllByText("Tempo Inti Media · 2026").length).toBeGreaterThan(0);
  });

  it("reads the search and the filter from the address", () => {
    window.history.replaceState(null, "", "/opac?q=laskar&klasifikasi=Fiksi");
    render(<OpacView />);
    expect(screen.getByRole("searchbox", { name: "searchLabel" })).toHaveValue("laskar");
    expect(results).toHaveBeenCalledWith(
      "laskar",
      expect.objectContaining({ classificationPrefix: "Fiksi" }),
    );
  });

  it("offers the catalogue's own classification groups as filters and keeps the choice in the address", async () => {
    const user = userEvent.setup();
    render(<OpacView />);
    await user.click(screen.getByRole("radio", { name: "Non-Fiksi" }));
    expect(window.location.search).toBe("?klasifikasi=Non-Fiksi");
    expect(results).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ classificationPrefix: "Non-Fiksi" }),
    );
  });

  it("clears the search and filter from an empty result", async () => {
    window.history.replaceState(null, "", "/opac?q=zzz");
    results.mockImplementation((search) =>
      search === ""
        ? { data: { data: CATALOGUE, library_name: "Perpustakaan" } }
        : { data: { data: [], library_name: "Perpustakaan" } },
    );
    const user = userEvent.setup();
    render(<OpacView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "clearSearch" }));
    expect(window.location.search).toBe("");
    expect(screen.getByRole("searchbox", { name: "searchLabel" })).toHaveValue("");
  });

  it("says the catalogue failed to load and offers a retry, instead of an empty list", async () => {
    window.history.replaceState(null, "", "/opac?q=x");
    catalogue({ isError: true, data: undefined });
    const user = userEvent.setup();
    render(<OpacView />);
    expect(screen.getByRole("alert")).toHaveTextContent("errorTitle");
    await user.click(screen.getByRole("button", { name: "retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("calls a full page the first titles and offers more", () => {
    const page = Array.from({ length: 20 }, (_, index) => title(index));
    results.mockReturnValue({ data: { data: page, library_name: "Perpustakaan" } });
    render(<OpacView />);
    expect(screen.getByText("resultCountFirst 20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "loadMore" })).toBeInTheDocument();
  });

  it("names the tab after the catalogue, not only the school", () => {
    setDocumentSchoolName("SMA Contoh");
    render(<OpacView />);
    expect(document.title).toBe("title · SMA Contoh");
  });
});
