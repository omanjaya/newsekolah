import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
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
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    useSingleFlight: actual.useSingleFlight,
    useScanFeedback: () => ({ playSuccess: vi.fn(), playError: vi.fn() }),
  };
});
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

  // A scanner double read after a return got 404 and the refusal replaced
  // "Dikembalikan tepat waktu" on the list and on the receipt.
  it("keeps a saved return when the same book is scanned again", async () => {
    returnByBarcode
      .mockResolvedValueOnce({
        title_id: "t1",
        member_user_id: "u1",
        due_on: "2026-11-20",
        returned_at: "2026-11-20T08:00:00Z",
        fine_amount: 0,
        late_days: 0,
      })
      .mockRejectedValueOnce(
        new ApiError({ status: 404, code: "LIBRARY_LOAN_NOT_FOUND", message: "not found" }),
      );
    findMember.mockResolvedValue({ status: "copy" });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });

    scan(result, "2026/00031");
    await waitFor(() => {
      expect(result.current.basket.return[0]?.state).toBe("done");
    });
    scan(result, "2026/00031");
    await waitFor(() => {
      expect(result.current.scanError).toContain("basket.alreadyReturned");
    });

    expect(result.current.scanError).toContain('"title":"Title t1"');
    expect(result.current.basket.return).toHaveLength(1);
    expect(result.current.basket.return[0]).toMatchObject({
      title: "Title t1",
      state: "done",
      detail: "basket.returnedOnTime",
    });
  });

  // Both reads of a double read arrive before React re-renders, so a
  // guard on the `scanning` state let the second through as a concurrent
  // request that could not see the first one's saved row.
  it("ignores a second read of a book while its return is in flight", async () => {
    let finishReturn: (loan: unknown) => void = () => undefined;
    returnByBarcode.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishReturn = resolve;
        }),
    );
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });

    act(() => {
      result.current.handleScan({ code: "2026/00031", source: "scanner", at: Date.now() });
      result.current.handleScan({ code: "2026/00031", source: "scanner", at: Date.now() });
    });
    await act(async () => {
      finishReturn({
        title_id: "t1",
        member_user_id: "u1",
        due_on: "2026-11-20",
        returned_at: "2026-11-20T08:00:00Z",
        fine_amount: 0,
        late_days: 0,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.basket.return[0]?.state).toBe("done");
    });
    expect(returnByBarcode).toHaveBeenCalledTimes(1);
    expect(findMember).not.toHaveBeenCalled();
    expect(result.current.basket.return).toHaveLength(1);
    expect(result.current.scanError).toBe("");
  });

  it("keeps a saved renewal when a rescan hits the renewal limit", async () => {
    renewByBarcode
      .mockResolvedValueOnce({ title_id: "t1", due_on: "2027-01-20", member_user_id: "u1" })
      .mockRejectedValueOnce(
        new ApiError({ status: 409, code: "LIBRARY_RENEWAL_LIMIT_REACHED", message: "limit" }),
      );
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("renew");
    });

    scan(result, "2026/00030");
    await waitFor(() => {
      expect(result.current.basket.renew[0]?.state).toBe("done");
    });
    scan(result, "2026/00030");
    await waitFor(() => {
      expect(result.current.scanError).toContain("basket.alreadyRenewed");
    });

    expect(result.current.scanError).toContain("error:LIBRARY_RENEWAL_LIMIT_REACHED");
    expect(result.current.basket.renew).toHaveLength(1);
    expect(result.current.basket.renew[0]?.detail).toContain("basket.renewedUntil");
  });

  // Failed rows used to be headed by the barcode, not the book.
  it("names a refused book by its title on a first scan", async () => {
    renewByBarcode.mockRejectedValue(
      new ApiError({ status: 409, code: "LIBRARY_RENEWAL_BLOCKED_OVERDUE", message: "late" }),
    );
    findCopy.mockResolvedValue({ barcode: "2026/00028", title_id: "t9" });
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("renew");
    });

    scan(result, "2026/00028");
    await waitFor(() => {
      expect(result.current.basket.renew).toHaveLength(1);
    });
    expect(result.current.basket.renew[0]).toMatchObject({
      barcode: "2026/00028",
      title: "Title t9",
      state: "failed",
      detail: "error:LIBRARY_RENEWAL_BLOCKED_OVERDUE",
    });
    // Not a "loan not found": no member-card lookup.
    expect(findMember).not.toHaveBeenCalled();
  });

  it("falls back to the barcode for a code that names no copy and no member", async () => {
    returnByBarcode.mockRejectedValue(
      new ApiError({ status: 404, code: "LIBRARY_LOAN_NOT_FOUND", message: "not found" }),
    );
    findMember.mockResolvedValue({ status: "none" });
    findCopy.mockRejectedValue(new ApiError({ status: 404, code: "NOT_FOUND", message: "nf" }));
    const { result } = renderHook(() => useDeskSession());
    act(() => {
      result.current.setMode("return");
    });

    scan(result, "XYZ");
    await waitFor(() => {
      expect(result.current.basket.return).toHaveLength(1);
    });
    expect(result.current.basket.return[0]).toMatchObject({
      title: "XYZ",
      state: "failed",
      detail: "error:LIBRARY_LOAN_NOT_FOUND",
    });
  });

  // A card scanned first in Kembalikan or Perpanjang was sent to the
  // barcode endpoints and reported as "Peminjaman tidak ditemukan".
  describe("a member card scanned in Kembalikan or Perpanjang", () => {
    const card = {
      status: "found",
      member: {
        user_id: "u7",
        user_name: "Siswa Contoh",
        member_no: "SEED-SISWA-01",
        nis: "2026001",
        username: "siswa",
      },
    };
    const notFound = new ApiError({
      status: 404,
      code: "LIBRARY_LOAN_NOT_FOUND",
      message: "not found",
    });

    it.each(["return", "renew"] as const)("selects the member in %s mode", async (mode) => {
      returnByBarcode.mockRejectedValue(notFound);
      renewByBarcode.mockRejectedValue(notFound);
      findMember.mockResolvedValue(card);
      const { result } = renderHook(() => useDeskSession());
      act(() => {
        result.current.setMode(mode);
      });

      scan(result, "SEED-SISWA-01");
      await waitFor(() => {
        expect(result.current.member?.userId).toBe("u7");
      });

      expect(findMember).toHaveBeenCalledWith("SEED-SISWA-01");
      expect(result.current.basket[mode]).toHaveLength(0);
      expect(result.current.scanError).toBe("");
    });

    it.each(["return", "renew"] as const)(
      "says it is a card when that member is already served (%s)",
      async (mode) => {
        returnByBarcode.mockRejectedValue(notFound);
        renewByBarcode.mockRejectedValue(notFound);
        findMember.mockResolvedValue(card);
        const { result } = renderHook(() => useDeskSession());
        act(() => {
          result.current.selectMember({ userId: "u7", name: "Siswa Contoh" });
          result.current.setMode(mode);
        });

        scan(result, "SEED-SISWA-01");
        await waitFor(() => {
          expect(result.current.scanError).toContain("member.cardNotBook");
        });

        expect(result.current.basket[mode]).toHaveLength(0);
        expect(result.current.member?.userId).toBe("u7");
      },
    );
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
