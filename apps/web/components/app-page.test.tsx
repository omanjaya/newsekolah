import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../messages/features";
import { getMessages } from "../lib/i18n/get-messages";
import { setDocumentSchoolName } from "../lib/page-title";

import { AppPage } from "./app-page";

const route = vi.hoisted(() => ({ pathname: "/journal", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

const ADMIN = {
  id: "u1",
  name: "Admin",
  profile_kind: "staff",
  roles: [{ id: "r1", slug: "admin", name: "Admin" }],
  duties: [],
  disabled_modules: [],
  permissions: [
    "view_users",
    "manage_permissions",
    "view_academic_data",
    "manage_master_data",
    "view_attendance",
    "manage_attendance",
    "view_reports",
    "view_library",
    "manage_library_catalog",
  ],
};
vi.mock("../lib/session/session-provider", () => ({ useSession: () => ({ me: ADMIN }) }));

const messages = getMessages("id");

function renderPage(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages as never}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("AppPage", () => {
  beforeEach(() => {
    route.pathname = "/journal";
    route.search = "";
    setDocumentSchoolName("SMA Contoh");
  });

  it("fills eyebrow, title and the area's tabs from the navigation registry", () => {
    const { container } = renderPage(<AppPage>Isi</AppPage>);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Absensi & Jurnal");
    expect(screen.getByText("Akademik")).toBeInTheDocument();

    const tabs = screen.getByRole("navigation", { name: "Bagian Absensi & Jurnal" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/attendance", "/journal", "/attendance/reports"]);
    expect(within(tabs).getByRole("link", { name: "Jurnal mengajar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The tabs sit under the header, inside the page head.
    const head = container.querySelector('[data-slot="page-head"]');
    expect(head).toContainElement(heading);
    expect(head).toContainElement(tabs);
    expect(heading.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the browser tab after the current page and the school", () => {
    renderPage(<AppPage>Isi</AppPage>);
    expect(document.title).toBe("Jurnal mengajar · SMA Contoh");
  });

  it("lets the page give its own title, eyebrow and tab title", () => {
    route.pathname = "/attendance";
    renderPage(
      <AppPage title="Presensi" eyebrow={false} documentTitle="Presensi hari ini">
        Isi
      </AppPage>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Presensi");
    expect(screen.queryByText("Akademik")).not.toBeInTheDocument();
    expect(document.title).toBe("Presensi hari ini · SMA Contoh");
  });

  it("carries the named query parameters across the tabs", () => {
    route.pathname = "/attendance";
    route.search = "date=2026-11-13&tab=x";
    renderPage(<AppPage navParams={["date"]}>Isi</AppPage>);
    expect(screen.getByRole("link", { name: "Jurnal mengajar" })).toHaveAttribute(
      "href",
      "/journal?date=2026-11-13",
    );
  });

  it("takes an area's own navigation, or none", () => {
    const { rerender } = renderPage(
      <AppPage nav={<nav aria-label="Navigasi khusus" />}>Isi</AppPage>,
    );
    expect(screen.getByRole("navigation", { name: "Navigasi khusus" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /^Bagian/ })).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="id" messages={messages as never}>
        <AppPage nav={false}>Isi</AppPage>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("leads a detail page back to its list instead of showing the area's tabs", () => {
    route.pathname = "/library/catalogue/t-1";
    renderPage(<AppPage title="Laskar Pelangi">Isi</AppPage>);
    const trail = screen.getByRole("navigation", { name: "Navigasi halaman" });
    expect(within(trail).getByRole("link", { name: "Katalog" })).toHaveAttribute(
      "href",
      "/library/catalogue",
    );
    expect(within(trail).getByText("Laskar Pelangi")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Perpustakaan")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /^Bagian/ })).not.toBeInTheDocument();
  });

  it("passes the header actions to PageHeader and the toolbar above the content", () => {
    renderPage(
      <AppPage
        primaryAction={<button type="button">Tambah</button>}
        toolbar={<button type="button">Saring</button>}
      >
        <p>Isi</p>
      </AppPage>,
    );
    const add = screen.getByRole("button", { name: "Tambah" });
    const filter = screen.getByRole("button", { name: "Saring" });
    expect(add.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      filter.compareDocumentPosition(screen.getByText("Isi")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the frame and the tab title when the content still renders its own heading", () => {
    renderPage(
      <AppPage header={false}>
        <h1>Kehadiran saya</h1>
      </AppPage>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.title).toBe("Jurnal mengajar · SMA Contoh");
  });

  it("sizes a fit page to the viewport under the app header", () => {
    const { container } = renderPage(<AppPage variant="fit">Isi</AppPage>);
    const root = container.querySelector("[data-page-shell]");
    expect(root).toHaveAttribute("data-variant", "fit");
    expect(root).toHaveClass("[--page-offset-top:var(--shell-header-height,3.5rem)]");
  });
});
