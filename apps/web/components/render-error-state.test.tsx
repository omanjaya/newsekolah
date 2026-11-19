import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMessages } from "../lib/i18n/get-messages";

import { RenderErrorState } from "./render-error-state";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderInId(error: Error & { digest?: string }) {
  return render(
    <NextIntlClientProvider locale="id" messages={getMessages("id") as never}>
      <RenderErrorState error={error} reset={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RenderErrorState", () => {
  it("asks for the code below when the error has a digest, and shows it", () => {
    renderInId(Object.assign(new Error("server"), { digest: "4021337" }));
    expect(screen.getByText(/beri tahu admin sekolah kode di bawah/)).toBeInTheDocument();
    expect(screen.getByText(/4021337/)).toBeInTheDocument();
  });

  // An error thrown in the browser has no digest: the copy must not
  // promise a code that never appears.
  it("does not mention a code when the error has no digest", () => {
    renderInId(new Error("client"));
    expect(
      screen.getByText("Muat ulang halaman ini. Bila tetap gagal, hubungi admin sekolah."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kode di bawah/)).not.toBeInTheDocument();
  });
});
