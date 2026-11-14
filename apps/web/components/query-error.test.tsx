import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../messages/features";
import { getMessages } from "../lib/i18n/get-messages";

import { QueryError } from "./query-error";

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
});
