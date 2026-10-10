import { render, screen, waitFor } from "@testing-library/react";
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
    data: { data: [{ id: "class-7a", name: "7A" }] },
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

function letters(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `letter-${index}`,
    student_user_id: `student-${index}`,
    level_label: "SP1",
    letter_number: `SP/${index}`,
    total_points: 25,
    issued_at: "2026-09-10T02:00:00Z",
    has_document: false,
  }));
}

describe("IssuedLettersPanel paging", () => {
  beforeEach(() => {
    mocks.useWarningLettersQuery.mockReset();
    mocks.useWarningLettersQuery.mockReturnValue({
      data: { data: letters(50) },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/discipline/warning-letters");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<IssuedLettersPanel />);

    expect(mocks.useWarningLettersQuery).toHaveBeenLastCalledWith(undefined, {
      limit: 50,
      offset: 0,
      search: "",
    });
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(mocks.useWarningLettersQuery).toHaveBeenLastCalledWith(undefined, {
      limit: 50,
      offset: 50,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("letters_page")).toBe("2");
  });

  it("returns to the first page when the class filter changes", async () => {
    window.history.replaceState(null, "", "/discipline/warning-letters?letters_page=3");
    const user = userEvent.setup();
    render(<IssuedLettersPanel />);

    await user.click(screen.getByRole("button", { name: "filters.class" }));
    await user.click(await screen.findByRole("button", { name: "7A" }));

    expect(mocks.useWarningLettersQuery).toHaveBeenLastCalledWith("class-7a", {
      limit: 50,
      offset: 0,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("letters_page")).toBe("1");
  });

  it("sends the debounced search and returns to the first page", async () => {
    window.history.replaceState(null, "", "/discipline/warning-letters?letters_page=3");
    const user = userEvent.setup();
    render(<IssuedLettersPanel />);

    await user.type(screen.getByRole("searchbox", { name: "searchPlaceholder" }), "bud");

    await waitFor(() => {
      expect(mocks.useWarningLettersQuery).toHaveBeenLastCalledWith(undefined, {
        limit: 50,
        offset: 0,
        search: "bud",
      });
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get("letters_q")).toBe("bud");
    expect(params.get("letters_page")).toBe("1");
  });
});
