import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useWarningLettersQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/warning-letters",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: {
      data: [
        { id: "class-7a", name: "7A" },
        { id: "class-7b", name: "7B" },
      ],
    },
    isLoading: false,
  }),
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../api", () => ({
  useWarningLettersQuery: mocks.useWarningLettersQuery,
  useWarningLetterDocumentUrlMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { IssuedLettersPanel } from "./issued-letters-panel";

describe("IssuedLettersPanel filters", () => {
  beforeEach(() => {
    mocks.useWarningLettersQuery.mockReset();
    mocks.useWarningLettersQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/warning-letters");
  });

  it("passes the chosen class to the warning letters query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<IssuedLettersPanel />);

    await user.click(screen.getByRole("button", { name: "filters.class" }));
    await user.click(await screen.findByRole("button", { name: "7B" }));

    expect(mocks.useWarningLettersQuery).toHaveBeenLastCalledWith("class-7b", {
      limit: 50,
      offset: 0,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("class-7b");
  });

  it("reads an initial class_id URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/discipline/warning-letters?class_id=class-7a");
    render(<IssuedLettersPanel />);

    expect(mocks.useWarningLettersQuery).toHaveBeenLastCalledWith("class-7a", {
      limit: 50,
      offset: 0,
      search: "",
    });
    expect(screen.getByRole("button", { name: "filters.class: 7A" })).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/discipline/warning-letters?class_id=class-7a");
    const user = userEvent.setup();
    render(<IssuedLettersPanel />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useWarningLettersQuery).toHaveBeenLastCalledWith(undefined, {
      limit: 50,
      offset: 0,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("");
  });
});
