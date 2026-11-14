import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lateArrivalQueueQuery = vi.hoisted(() => vi.fn());
const exitPermitReviewQueueQuery = vi.hoisted(() => vi.fn());

vi.mock("../../../permits/api", () => ({
  useLateArrivalQueueQuery: lateArrivalQueueQuery,
  useExitPermitReviewQueueQuery: exitPermitReviewQueueQuery,
}));

vi.mock("../../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "c1", name: "X-A" }] } }),
  useLookup: (rows: { id: string }[] | undefined) =>
    new Map((rows ?? []).map((row) => [row.id, row])),
}));
vi.mock("../../../reference/directory-names", () => ({
  useDirectoryNames: (ids: string[]) => new Map(ids.map((id) => [id, { id, name: `Siswa ${id}` }])),
}));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
      { has: () => true },
    ),
}));

import { EMPTY_BLOCK } from "../types";
import type { Me } from "../types";

import { usePicketBlock } from "./picket";

const me = { permissions: [] } as unknown as Me;

function refetchable(overrides: Record<string, unknown>) {
  return { isLoading: false, isError: false, data: undefined, refetch: vi.fn(), ...overrides };
}

describe("usePicketBlock", () => {
  beforeEach(() => {
    lateArrivalQueueQuery.mockReset();
    exitPermitReviewQueueQuery.mockReset();
  });

  it("returns EMPTY_BLOCK and disables both queries when inactive", () => {
    lateArrivalQueueQuery.mockReturnValue(refetchable({}));
    exitPermitReviewQueueQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => usePicketBlock(me, false));

    expect(result.current).toBe(EMPTY_BLOCK);
    expect(lateArrivalQueueQuery).toHaveBeenCalledWith(false);
    expect(exitPermitReviewQueueQuery).toHaveBeenCalledWith(false);
  });

  it("shows tiles at zero and a calm duty hero once both queues have loaded empty", () => {
    lateArrivalQueueQuery.mockReturnValue(refetchable({ data: { data: [] } }));
    exitPermitReviewQueueQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    const { result } = renderHook(() => usePicketBlock(me, true));

    expect(lateArrivalQueueQuery).toHaveBeenCalledWith(true);
    expect(exitPermitReviewQueueQuery).toHaveBeenCalledWith(true);
    expect(result.current.hero?.key).toBe("picket.idle");
    expect(result.current.hero?.tone).toBe("neutral");
    expect(result.current.hero?.action?.href).toBe("/duty");
    expect(result.current.hero?.secondaryAction?.href).toBe("/scan");
    expect(result.current.tiles.find((t) => t.key === "picket.late")?.value).toBe("0");
    expect(result.current.tiles.find((t) => t.key === "picket.exit")?.value).toBe("0");
  });

  it("raises a hero pointing at the late-arrival queue, with the duty QR beside it", () => {
    lateArrivalQueueQuery.mockReturnValue(
      refetchable({
        data: {
          data: [
            { instance_id: "a", reason: "macet", occurrence_number: 1 },
            { instance_id: "b", reason: "sakit", occurrence_number: 2 },
          ],
        },
      }),
    );
    exitPermitReviewQueueQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    const { result } = renderHook(() => usePicketBlock(me, true));

    expect(result.current.hero?.title).toContain('"count":2');
    expect(result.current.hero?.action?.href).toBe("/late-arrivals");
    expect(result.current.hero?.secondaryAction?.href).toBe("/duty");
    expect(result.current.tiles.find((t) => t.key === "picket.late")?.value).toBe("2");
  });

  it("omits a source's tile and hero while that query is still loading", () => {
    lateArrivalQueueQuery.mockReturnValue(refetchable({ isLoading: true }));
    exitPermitReviewQueueQuery.mockReturnValue(refetchable({ isLoading: true }));

    const { result } = renderHook(() => usePicketBlock(me, true));

    expect(result.current.tiles).toEqual([]);
    expect(result.current.hero).toBeUndefined();
  });

  it("shows a retry action and no tiles when a query fails", () => {
    const refetch = vi.fn();
    lateArrivalQueueQuery.mockReturnValue(refetchable({ isError: true, refetch }));
    exitPermitReviewQueueQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    const { result } = renderHook(() => usePicketBlock(me, true));

    expect(result.current.tiles.find((t) => t.key === "picket.late")).toBeUndefined();
    render(<>{result.current.main.map((slot) => slot.node)}</>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("returns EMPTY_BLOCK and fires neither queue while permits is off", () => {
    lateArrivalQueueQuery.mockReturnValue(refetchable({}));
    exitPermitReviewQueueQuery.mockReturnValue(refetchable({}));
    const permitsOff = { permissions: [], disabled_modules: ["permits"] } as unknown as Me;

    const { result } = renderHook(() => usePicketBlock(permitsOff, true));

    expect(result.current).toBe(EMPTY_BLOCK);
    expect(lateArrivalQueueQuery).toHaveBeenCalledWith(false);
    expect(exitPermitReviewQueueQuery).toHaveBeenCalledWith(false);
  });
});
