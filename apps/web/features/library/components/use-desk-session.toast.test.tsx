import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { toast } from "@newsekolah/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMutationCache } from "../../../lib/query/mutation-cache";

import { useDeskSession } from "./use-desk-session";

// The real desk-api hooks under the app's real MutationCache: the other
// desk session tests mock the mutations away, so they cannot see the
// cache's generic error toast that a refusal the desk reports itself must
// not raise on top of its own line or row.

const client = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));

vi.mock("../../../lib/api/client", () => ({ useApiClient: () => client }));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    useScanQueue: actual.useScanQueue,
    useScanFeedback: () => ({ playSuccess: vi.fn(), playError: vi.fn() }),
    toast: { success: vi.fn(), error: vi.fn() },
  };
});
vi.mock("../members-api", () => ({
  useLibraryMemberQuery: () => ({ data: undefined }),
  useLibraryMemberBorrowingStatusQuery: () => ({ data: undefined }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error:${code}`,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

const cardMember = {
  user_id: "u7",
  user_name: "Siswa Contoh",
  member_no: "SEED-SISWA-01",
  nis: "2026001",
  username: "siswa",
};

function notFound(code: string) {
  return new ApiError({ status: 404, code, message: "not found" });
}

/** The server as the desk meets it: no loan for any code, one member card, no copies. */
function serveNoLoans() {
  client.POST.mockImplementation(() => Promise.reject(notFound("LIBRARY_LOAN_NOT_FOUND")));
  client.GET.mockImplementation(
    (path: string, init: { params: { query: { q?: string; code?: string } } }) => {
      if (path === "/v1/library/lookup") {
        const q = init.params.query.q ?? "";
        return Promise.resolve({
          data: q === cardMember.member_no ? [{ member: cardMember }] : [],
        });
      }
      return Promise.reject(notFound("LIBRARY_COPY_NOT_FOUND"));
    },
  );
}

function renderDesk() {
  const queryClient = new QueryClient({
    mutationCache: createMutationCache(),
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return renderHook(() => useDeskSession(), { wrapper: Wrapper });
}

function scan(result: { current: ReturnType<typeof useDeskSession> }, code: string) {
  act(() => {
    result.current.handleScan({ code, source: "scanner", at: Date.now() });
  });
}

describe("useDeskSession error toasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serveNoLoans();
  });

  it.each(["return", "renew"] as const)(
    "selects the member for a card scanned in %s mode with no error toast",
    async (mode) => {
      const { result } = renderDesk();
      act(() => {
        result.current.setMode(mode);
      });

      scan(result, cardMember.member_no);
      await waitFor(() => {
        expect(result.current.member?.userId).toBe("u7");
      });

      expect(result.current.scanError).toBe("");
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it.each(["return", "renew"] as const)(
    "reports an unknown code in %s mode as one failed row and no toast",
    async (mode) => {
      const { result } = renderDesk();
      act(() => {
        result.current.setMode(mode);
      });

      scan(result, "XYZ");
      await waitFor(() => {
        expect(result.current.basket[mode]).toHaveLength(1);
      });

      expect(result.current.basket[mode][0]).toMatchObject({
        title: "XYZ",
        state: "failed",
        detail: "error:LIBRARY_LOAN_NOT_FOUND",
      });
      expect(client.GET).toHaveBeenCalledWith("/v1/library/copies/find", {
        params: { query: { code: "XYZ" } },
      });
      expect(toast.error).not.toHaveBeenCalled();
    },
  );
});
