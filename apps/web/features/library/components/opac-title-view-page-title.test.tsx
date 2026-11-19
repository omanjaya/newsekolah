import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setDocumentSchoolName } from "../../../lib/page-title";

import { OpacTitleView } from "./opac-title-view";

interface QueryState {
  data?: unknown;
  isLoading: boolean;
  error: Error | null;
}

const state = vi.hoisted(() => ({ current: undefined as QueryState | undefined }));

vi.mock("../opac-api", () => ({
  useOpacTitleQuery: () => state.current,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

const DETAIL = {
  title: {
    id: "t1",
    title: "Laskar Pelangi",
    author: "Andrea Hirata",
    classification: "Fiksi - Novel",
  },
  copies: [],
};

beforeEach(() => {
  setDocumentSchoolName("SMA Contoh");
});

afterEach(() => {
  document.title = "";
});

// A shared link, a bookmark or the tab strip should say which book this is.
describe("OpacTitleView tab title", () => {
  it("names the catalogue while the book loads", () => {
    state.current = { isLoading: true, error: null };
    render(<OpacTitleView titleId="t1" />);
    expect(document.title).toBe("title · SMA Contoh");
  });

  it("names the book once it loads", () => {
    state.current = { isLoading: false, error: null, data: DETAIL };
    render(<OpacTitleView titleId="t1" />);
    expect(document.title).toBe("Laskar Pelangi · SMA Contoh");
  });

  it("names the not-found state for an unknown book", () => {
    state.current = { isLoading: false, error: new Error("404") };
    render(<OpacTitleView titleId="unknown" />);
    expect(document.title).toBe("detail.notFoundTitle · SMA Contoh");
  });
});
