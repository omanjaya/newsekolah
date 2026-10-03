import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useViolationTypesQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/catalog",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useViolationTypesQuery: mocks.useViolationTypesQuery,
  useDeleteViolationTypeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ViolationCatalogView } from "./violation-catalog-view";

describe("ViolationCatalogView filters", () => {
  beforeEach(() => {
    mocks.useViolationTypesQuery.mockReset();
    mocks.useViolationTypesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/catalog");
  });

  it("toggles the include-inactive filter directly and writes include_inactive=true to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationCatalogView />);

    const toggle = screen.getByRole("button", { name: "includeInactive" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useViolationTypesQuery).toHaveBeenLastCalledWith(true);
    expect(new URLSearchParams(window.location.search).get("include_inactive")).toBe("true");
  });

  it("reads an initial include_inactive=true URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/discipline/catalog?include_inactive=true");
    render(<ViolationCatalogView />);

    expect(mocks.useViolationTypesQuery).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "includeInactive" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clears the include-inactive filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/discipline/catalog?include_inactive=true");
    const user = userEvent.setup();
    render(<ViolationCatalogView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useViolationTypesQuery).toHaveBeenLastCalledWith(false);
    expect(new URLSearchParams(window.location.search).get("include_inactive")).toBe("");
  });
});
