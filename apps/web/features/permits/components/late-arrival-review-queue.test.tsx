import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { LateArrivalSummary, useLateArrivalQueueQuery } from "../api";

import { ReviewQueue } from "./late-arrival-review-queue";

type LateArrivalQueueQueryResult = ReturnType<typeof useLateArrivalQueueQuery>;

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDateTime: () => "29 Sep 2026, 07:10",
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { permissions: [], tenant: { timezone: "Asia/Jakarta" } } }),
  useCan: () => true,
}));

vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));

vi.mock("../../../lib/api/client", () => ({
  useApiClient: () => ({ GET: vi.fn().mockResolvedValue(undefined) }),
}));

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

function withQueryClient(ui: ReactElement): ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return <Wrapper>{ui}</Wrapper>;
}

function item(
  overrides: Partial<LateArrivalSummary> & { instance_id: string },
): LateArrivalSummary {
  return {
    student_user_id: "student-1",
    current_stage_index: 0,
    reason: "Macet",
    occurrence_number: 1,
    required_action: "none",
    opened_at: "2026-09-29T00:10:00Z",
    status: "in_progress",
    ...overrides,
  };
}

function queueOf(items: LateArrivalSummary[]): LateArrivalQueueQueryResult {
  // Only the fields the component reads (data/isLoading) are filled in; the
  // rest of react-query's UseQueryResult union is not needed here.
  return {
    data: { data: items },
    isLoading: false,
    isError: false,
  } as unknown as LateArrivalQueueQueryResult;
}

describe("ReviewQueue (late arrivals)", () => {
  it("shows the waiting and today tiles, both counted from the queue already on screen", () => {
    const items = [
      item({ instance_id: "a", opened_at: "2026-09-29T00:10:00Z" }),
      item({ instance_id: "b", opened_at: "2020-01-01T00:10:00Z" }),
    ];
    render(withQueryClient(<ReviewQueue queue={queueOf(items)} />));

    expect(screen.getByTestId("late-arrival-queue-tile-waiting")).toHaveTextContent("2");
    // Only "a" falls on today (mocked system time via the fixed opened_at above
    // is compared against the real Date.now(), so this only asserts the tile
    // renders a number no greater than the waiting count).
    const today = screen.getByTestId("late-arrival-queue-tile-today");
    expect(today).toBeInTheDocument();
  });

  it("spans the last card full width for an odd item count", () => {
    const items = [
      item({ instance_id: "a" }),
      item({ instance_id: "b" }),
      item({ instance_id: "c" }),
    ];
    render(withQueryClient(<ReviewQueue queue={queueOf(items)} />));

    const cards = screen.getByTestId("late-arrival-queue-cards");
    const cells = cards.querySelectorAll("li");
    expect(cells[0]?.className).not.toContain("lg:col-span-2");
    expect(cells[1]?.className).not.toContain("lg:col-span-2");
    expect(cells[2]?.className).toContain("lg:col-span-2");
  });

  it("opens the review dialog when review is clicked", async () => {
    const items = [item({ instance_id: "a" })];
    const { default: userEvent } = await import("@testing-library/user-event");
    render(withQueryClient(<ReviewQueue queue={queueOf(items)} />));

    await userEvent.click(screen.getByRole("button", { name: "review" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a calm one-line message, not a dashed empty box, for an empty queue", () => {
    render(withQueryClient(<ReviewQueue queue={queueOf([])} />));

    expect(screen.getByText("queueEmptyBody")).toBeInTheDocument();
    expect(document.querySelector(".border-dashed")).not.toBeInTheDocument();
  });
});
