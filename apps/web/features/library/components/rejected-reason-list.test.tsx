import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { getMessages } from "../../../lib/i18n/get-messages";

import { type RejectedReasonItem, RejectedReasonList } from "./rejected-reason-list";

function renderList(items: RejectedReasonItem[]) {
  return render(
    <NextIntlClientProvider locale="id" messages={getMessages("id") as never}>
      <RejectedReasonList items={items} />
    </NextIntlClientProvider>,
  );
}

describe("RejectedReasonList", () => {
  it("shows each row's label with its translated code, not the server text", () => {
    renderList([
      {
        key: "1",
        label: "Budi",
        code: "LIBRARY_MEMBER_SUSPENDED",
        reason: "library member is suspended",
      },
      {
        key: "2",
        label: "Eka",
        code: "LIBRARY_MEMBER_TYPE_NOT_FOUND",
        reason: "library member type not found",
      },
    ]);
    expect(screen.getByText("Budi: Anggota ini sedang ditangguhkan")).toBeInTheDocument();
    expect(screen.getByText("Eka: Jenis anggota tidak ditemukan")).toBeInTheDocument();
    expect(screen.queryByText(/library member/)).not.toBeInTheDocument();
  });

  it("translates an internal error instead of showing the server string", () => {
    renderList([
      { key: "1", label: "Citra", code: "INTERNAL_ERROR", reason: "create member: boom" },
    ]);
    expect(screen.getByText("Citra: Terjadi kesalahan pada server, coba lagi")).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
  });

  it("falls back to the server text for a code the catalog does not know", () => {
    renderList([{ key: "1", label: "Dewi", code: "SOMETHING_NEW", reason: "new reason" }]);
    expect(screen.getByText("Dewi: new reason")).toBeInTheDocument();
  });
});
