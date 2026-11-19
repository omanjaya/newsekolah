import { ApiError } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../messages/features";
import { getAccessToken, setAccessToken } from "../lib/api/access-token";
import { getMessages } from "../lib/i18n/get-messages";

import { QueryError, SharedRetry } from "./query-error";

const replace = vi.fn();
const forgetAccessToken = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/dashboard",
}));

vi.mock("../lib/api/client", () => ({
  useApiClient: () => ({ forgetAccessToken }),
}));

function renderIn(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="id" messages={getMessages("id") as never}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("QueryError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a danger alert that says what failed and retries", async () => {
    const retry = vi.fn();
    renderIn(<QueryError retry={retry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Data gagal dimuat");
    expect(alert).toHaveTextContent("Terjadi kesalahan, coba lagi");
    await userEvent.setup().click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("leaves its retry to a surrounding shared retry, still saying what failed", () => {
    renderIn(
      <SharedRetry active>
        <QueryError retry={() => undefined} />
      </SharedRetry>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Data gagal dimuat");
    expect(screen.queryByRole("button", { name: "Coba lagi" })).not.toBeInTheDocument();
  });

  it("keeps its retry when the shared retry is off", () => {
    renderIn(
      <SharedRetry active={false}>
        <QueryError retry={() => undefined} />
      </SharedRetry>,
    );
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });

  it("names the cause and shows the code when it gets the query's error", () => {
    renderIn(
      <QueryError
        retry={() => undefined}
        error={new ApiError({ status: 403, code: "FORBIDDEN", message: "forbidden" })}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Data ini tidak bisa dibuka");
    expect(alert).toHaveTextContent("Anda tidak memiliki akses untuk tindakan ini");
    expect(alert).toHaveTextContent("Kode galat: FORBIDDEN");
  });

  it("says there is no connection when the request never reached the server", () => {
    renderIn(
      <QueryError
        retry={() => undefined}
        error={new ApiError({ status: 0, code: "NETWORK", message: "offline" })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Tidak ada koneksi");
  });

  it("says so when the browser is offline, even without the error", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderIn(<QueryError retry={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Tidak ada koneksi");
  });

  // The API client already tried a refresh before a 401 reaches a screen,
  // so "Coba lagi" could never work there.
  describe("for a session that is over", () => {
    const revoked = new ApiError({
      status: 401,
      code: "AUTH_SESSION_REVOKED",
      message: "revoked",
    });

    function renderWithSession(retry: () => unknown) {
      const queryClient = new QueryClient();
      queryClient.setQueryData(["me"], { id: "u1" });
      setAccessToken("revoked-token");
      renderIn(
        <QueryClientProvider client={queryClient}>
          <QueryError retry={retry} error={revoked} />
        </QueryClientProvider>,
      );
      return queryClient;
    }

    it("says the session ended in words, not only a code", () => {
      renderWithSession(() => undefined);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Sesi berakhir");
      expect(alert).toHaveTextContent("Sesi Anda sudah berakhir. Masuk lagi untuk melanjutkan.");
      expect(alert).toHaveTextContent("Kode galat: AUTH_SESSION_REVOKED");
      expect(screen.queryByRole("button", { name: "Coba lagi" })).not.toBeInTheDocument();
    });

    it("ends the session and opens the sign-in page with a way back", async () => {
      const retry = vi.fn();
      const queryClient = renderWithSession(retry);

      await userEvent.setup().click(screen.getByRole("button", { name: "Masuk lagi" }));

      expect(retry).not.toHaveBeenCalled();
      expect(forgetAccessToken).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBeNull();
      expect(queryClient.getQueryData(["me"])).toBeUndefined();
      expect(replace).toHaveBeenCalledWith("/login?next=%2Fdashboard&reason=session-ended");
    });
  });
});
