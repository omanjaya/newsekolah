import { ApiError } from "@newsekolah/api-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDeskSession } from "./use-desk-session";

const findMember = vi.hoisted(() => vi.fn());
const findCopy = vi.hoisted(() => vi.fn());
const batchBorrow = vi.hoisted(() => vi.fn());
const returnByBarcode = vi.hoisted(() => vi.fn());
const renewByBarcode = vi.hoisted(() => vi.fn());

vi.mock("../desk-api", () => ({
  useFindMemberByCodeMutation: () => ({ mutateAsync: findMember }),
  useFindLibraryCopyByCodeMutation: () => ({ mutateAsync: findCopy }),
  useLibraryTitleNameMutation: () => ({
    mutateAsync: (titleId: string) => Promise.resolve(`Title ${titleId}`),
  }),
  useBatchBorrowLoansMutation: () => ({ mutateAsync: batchBorrow, isPending: false }),
  useReturnLoanByBarcodeMutation: () => ({ mutateAsync: returnByBarcode }),
  useRenewLoanByBarcodeMutation: () => ({ mutateAsync: renewByBarcode }),
}));
vi.mock("../members-api", () => ({
  useLibraryMemberQuery: () => ({ data: undefined }),
  useLibraryMemberBorrowingStatusQuery: () => ({ data: undefined }),
}));
vi.mock("@newsekolah/ui", () => ({
  useScanFeedback: () => ({ playSuccess: vi.fn(), playError: vi.fn() }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error:${code}`,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

function scan(result: { current: ReturnType<typeof useDeskSession> }, code: string) {
  act(() => {
    result.current.handleScan({ code, source: "manual", at: Date.now() });
  });
}

const member = { userId: "u1", name: "Siswa Satu" };

describe("useDeskSession", () => {
  beforeEach(() => {
    for (const mock of [findMember, findCopy, batchBorrow, returnByBarcode, renewByBarcode]) {
      mock.mockReset();
    }
  });

  it("returns a book scanned with no member selected, without a member lookup", async () => {
    returnByBarcode.mockResolvedValue({
      title_id: "t1",
      due_on: "2026-11-20",
      returned_at: "2026-11-20T08:00:00Z",
      fine_amount: 0,
      late_days: 0,
    });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });

    scan(result, "2026/00012");

    await waitFor(() => {
      expect(result.current.basket.return).toHaveLength(1);
    });
    expect(returnByBarcode).toHaveBeenCalledWith({ barcode: "2026/00012" });
    expect(findMember).not.toHaveBeenCalled();
    expect(result.current.basket.return[0]).toMatchObject({
      barcode: "2026/00012",
      state: "done",
      detail: "basket.returnedOnTime",
    });
    expect(result.current.scanError).toBe("");
  });

  it("shows the working days late and the fine the server charged", async () => {
    // 07:30 WITA on Friday 25 Dec is still 24 Dec in UTC: the server
    // counted one working day late on the school's calendar.
    returnByBarcode.mockResolvedValue({
      title_id: "t1",
      due_on: "2026-12-24",
      returned_at: "2026-12-24T23:30:00Z",
      fine_amount: 500,
      late_days: 1,
    });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });

    scan(result, "2026/00014");

    await waitFor(() => {
      expect(result.current.basket.return).toHaveLength(1);
    });
    const detail = result.current.basket.return[0]?.detail ?? "";
    expect(detail).toContain("basket.returnedLateFine");
    expect(detail).toContain('"days":1');
    expect(detail).toMatch(/Rp\s?500/);
  });

  it("claims no fine for a late return that charged none", async () => {
    returnByBarcode.mockResolvedValue({
      title_id: "t1",
      due_on: "2026-12-24",
      returned_at: "2026-12-28T01:00:00Z",
      fine_amount: 0,
      late_days: 2,
    });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });

    scan(result, "2026/00014");

    await waitFor(() => {
      expect(result.current.basket.return).toHaveLength(1);
    });
    expect(result.current.basket.return[0]?.detail).toBe('basket.returnedLate {"days":2}');
  });

  it("counts a Friday-due book returned on Monday as one working day late, not three", async () => {
    // Due Fri 18 Dec, returned Mon 21 Dec: the closed weekend is not
    // charged, so the server reports one working day late.
    returnByBarcode.mockResolvedValue({
      title_id: "t1",
      due_on: "2026-12-18",
      returned_at: "2026-12-21T01:00:00Z",
      fine_amount: 500,
      late_days: 1,
    });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });

    scan(result, "2026/00015");

    await waitFor(() => {
      expect(result.current.basket.return).toHaveLength(1);
    });
    const detail = result.current.basket.return[0]?.detail ?? "";
    expect(detail).toContain("basket.returnedLateFine");
    expect(detail).toContain('"days":1');
  });

  it("reports an on-time return when the server charged no working day late", async () => {
    // Due Fri 18 Dec, handed to a kiosk on Saturday 19 Dec with the
    // library closed on weekends: a calendar day passed, no working day.
    returnByBarcode.mockResolvedValue({
      title_id: "t1",
      due_on: "2026-12-18",
      returned_at: "2026-12-19T02:00:00Z",
      fine_amount: 0,
      late_days: 0,
    });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });

    scan(result, "2026/00016");

    await waitFor(() => {
      expect(result.current.basket.return).toHaveLength(1);
    });
    expect(result.current.basket.return[0]?.detail).toBe("basket.returnedOnTime");
  });

  it("shows a renewal saved on a re-scan in place of the earlier refusal", async () => {
    renewByBarcode
      .mockRejectedValueOnce(
        new ApiError({ status: 409, code: "LIBRARY_RENEWAL_BLOCKED_OVERDUE", message: "late" }),
      )
      .mockResolvedValueOnce({ title_id: "t1", due_on: "2027-01-01", member_user_id: "u1" });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("renew");
    });

    scan(result, "2026/00040");
    await waitFor(() => {
      expect(result.current.basket.renew[0]?.state).toBe("failed");
    });
    scan(result, "2026/00040");
    await waitFor(() => {
      expect(result.current.basket.renew[0]?.state).toBe("done");
    });

    expect(result.current.basket.renew).toHaveLength(1);
    expect(result.current.basket.renew[0]?.detail).toContain("basket.renewedUntil");
  });

  it("renews a book scanned with no member selected", async () => {
    renewByBarcode.mockResolvedValue({ title_id: "t1", due_on: "2026-12-01" });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("renew");
    });

    scan(result, "2026/00012");

    await waitFor(() => {
      expect(result.current.basket.renew).toHaveLength(1);
    });
    expect(renewByBarcode).toHaveBeenCalledWith({ barcode: "2026/00012" });
    expect(findMember).not.toHaveBeenCalled();
  });

  it("says a book barcode is a book, not an unknown card, when lending starts", async () => {
    findMember.mockResolvedValue({ status: "copy" });
    const { result } = renderHook(() => useDeskSession());

    scan(result, "2026/00012");

    await waitFor(() => {
      expect(result.current.scanError).toContain("member.copyNotCard");
    });
    expect(result.current.scanError).not.toContain("member.notFound");
  });

  it("keeps only the served member's own returns from an idle desk", async () => {
    returnByBarcode
      .mockResolvedValueOnce({
        title_id: "t1",
        member_user_id: "u1",
        due_on: "2026-11-20",
        returned_at: "2026-11-20T08:00:00Z",
        fine_amount: 0,
      })
      .mockResolvedValueOnce({
        title_id: "t2",
        member_user_id: "u2",
        due_on: "2026-11-20",
        returned_at: "2026-11-20T08:00:00Z",
        fine_amount: 0,
      })
      .mockRejectedValueOnce(new Error("not found"));
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });
    for (const barcode of ["A", "B", "C"]) {
      scan(result, barcode);
      await waitFor(() => {
        expect(result.current.scanning).toBe(false);
      });
    }
    expect(result.current.basket.return).toHaveLength(3);

    act(() => {
      result.current.selectMember(member);
    });
    expect(result.current.basket.return.map((item) => item.barcode)).toEqual(["A"]);

    act(() => {
      result.current.selectMember({ userId: "u2", name: "Siswa Dua" });
    });
    expect(result.current.basket.return).toHaveLength(0);
  });

  it("lends a reserved copy through the server, which knows whom the hold is for", async () => {
    findCopy.mockResolvedValue({
      barcode: "2026/00003",
      title_id: "t1",
      status: "reserved",
      access: "loanable",
    });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.selectMember(member);
    });

    scan(result, "2026/00003");

    await waitFor(() => {
      expect(result.current.basket.borrow).toHaveLength(1);
    });
    expect(result.current.basket.borrow[0]?.state).toBe("pending");
  });

  it("sends the borrow basket oldest scan first and matches each loan to its own row", async () => {
    for (const barcode of ["A", "B", "C"]) {
      findCopy.mockResolvedValueOnce({
        barcode,
        title_id: barcode,
        status: "available",
        access: "loanable",
      });
    }
    batchBorrow.mockResolvedValue({
      loans: [{ due_on: "2026-12-03" }],
      rejected: [
        { barcode: "B", code: "LIBRARY_LOAN_LIMIT_REACHED", reason: "limit" },
        { barcode: "C", code: "LIBRARY_LOAN_LIMIT_REACHED", reason: "limit" },
      ],
    });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.selectMember(member);
    });
    for (const barcode of ["A", "B", "C"]) {
      scan(result, barcode);
      await waitFor(() => {
        expect(result.current.scanning).toBe(false);
      });
    }
    expect(result.current.basket.borrow.map((item) => item.barcode)).toEqual(["C", "B", "A"]);

    await act(async () => {
      await result.current.confirmBorrow();
    });

    expect(batchBorrow).toHaveBeenCalledWith({ member_user_id: "u1", barcodes: ["A", "B", "C"] });
    const byBarcode = Object.fromEntries(
      result.current.basket.borrow.map((item) => [item.barcode, item]),
    );
    expect(byBarcode.A?.state).toBe("done");
    expect(byBarcode.B).toMatchObject({
      state: "failed",
      detail: "error:LIBRARY_LOAN_LIMIT_REACHED",
    });
    expect(byBarcode.C?.state).toBe("failed");
  });
});
