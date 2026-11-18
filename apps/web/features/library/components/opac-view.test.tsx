import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useOpacTitlesQuery: vi.fn(),
  useOpacTitleQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../opac-api", () => ({
  useOpacTitlesQuery: mocks.useOpacTitlesQuery,
  useOpacTitleQuery: mocks.useOpacTitleQuery,
  useOpacHighlightsQuery: () => ({ data: undefined, isLoading: false }),
}));

import { OpacTitleView } from "./opac-title-view";
import { OpacView } from "./opac-view";

const moduleDisabled = new ApiError({ status: 403, code: "MODULE_DISABLED", message: "x" });
const serverError = new ApiError({ status: 500, code: "INTERNAL", message: "x" });
const notFound = new ApiError({ status: 404, code: "NOT_FOUND", message: "x" });

function failed(error: ApiError, refetch = vi.fn()) {
  return { data: undefined, isLoading: false, isError: true, error, refetch };
}

describe("OpacView", () => {
  beforeEach(() => {
    mocks.useOpacTitlesQuery.mockReset();
  });

  it("shows the empty catalogue only when the search really found nothing", () => {
    mocks.useOpacTitlesQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<OpacView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.queryByText("unavailableTitle")).not.toBeInTheDocument();
  });

  it("shows the unavailable page, not an empty catalogue, once library is switched off", () => {
    mocks.useOpacTitlesQuery.mockReturnValue(failed(moduleDisabled));
    render(<OpacView />);
    expect(screen.getByText("unavailableTitle")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "signIn" })).toHaveAttribute("href", "/login");
  });

  it("offers a retry for any other failure instead of an empty catalogue", async () => {
    const refetch = vi.fn();
    mocks.useOpacTitlesQuery.mockReturnValue(failed(serverError, refetch));
    render(<OpacView />);
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "actions.retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("OpacTitleView", () => {
  beforeEach(() => {
    mocks.useOpacTitleQuery.mockReset();
  });

  it("shows the unavailable page once library is switched off", () => {
    mocks.useOpacTitleQuery.mockReturnValue(failed(moduleDisabled));
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("unavailableTitle")).toBeInTheDocument();
    expect(screen.queryByText("detail.notFoundTitle")).not.toBeInTheDocument();
  });

  it("says the title is not found only for a 404", () => {
    mocks.useOpacTitleQuery.mockReturnValue(failed(notFound));
    render(<OpacTitleView titleId="t1" />);
    expect(screen.getByText("detail.notFoundTitle")).toBeInTheDocument();
  });

  it("offers a retry for any other failure", async () => {
    const refetch = vi.fn();
    mocks.useOpacTitleQuery.mockReturnValue(failed(serverError, refetch));
    render(<OpacTitleView titleId="t1" />);
    expect(screen.queryByText("detail.notFoundTitle")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "actions.retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});
