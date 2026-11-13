import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Printer, Trash2 } from "lucide-react";
import { createRef, forwardRef, type AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Button } from "./button.js";
import { PageHeader } from "./page-header.js";
import { UiLabelsProvider } from "./ui-labels.js";
import { UiLinkProvider } from "./ui-link.js";

const ClientLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function ClientLink(props, ref) {
    // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive through the spread
    return <a ref={ref} data-client-link="" {...props} />;
  },
);

describe("PageHeader", () => {
  it("renders what existing pages pass: a muted eyebrow over a display h1, no rule", async () => {
    const { container } = render(<PageHeader eyebrow="Data Sekolah" title="Siswa & Kelas" />);
    expect(screen.getByRole("heading", { level: 1, name: "Siswa & Kelas" })).toHaveClass(
      "text-display",
    );
    expect(screen.getByText("Data Sekolah")).toHaveClass("text-body-sm", "text-fg-muted");
    expect(container.firstElementChild).not.toHaveClass("border-b");
    expect(container.firstElementChild).toHaveClass("pb-2");
    await expectNoAxeViolations(container);
  });

  it("adds a description, a rule on request, and free-form actions", () => {
    const { container } = render(
      <PageHeader
        title="Nilai"
        description="Nilai per kelas dan mata pelajaran."
        divider
        actions={<Button>Ekspor</Button>}
      />,
    );
    expect(screen.getByText("Nilai per kelas dan mata pelajaran.")).toHaveClass("max-w-prose");
    expect(container.firstElementChild).toHaveClass("border-b", "border-line");
    expect(screen.getByRole("button", { name: "Ekspor" })).toBeInTheDocument();
  });

  it("links the breadcrumb through the provided client link, the last item current", async () => {
    const { container } = render(
      <UiLabelsProvider labels={{ breadcrumbLabel: "Breadcrumb" }}>
        <UiLinkProvider component={ClientLink}>
          <PageHeader
            title="X-A"
            breadcrumb={[
              { label: "Data Sekolah", href: "/school" },
              { label: "Kelas", href: "/school/classes" },
              { label: "X-A" },
            ]}
          />
        </UiLinkProvider>
      </UiLabelsProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/school", "/school/classes"]);
    expect(links[0]).toHaveAttribute("data-client-link");
    expect(within(nav).getByText("X-A")).toHaveAttribute("aria-current", "page");
    await expectNoAxeViolations(container);
  });

  it("keeps a lone back crumb a link", () => {
    render(
      <PageHeader title="Pertemuan 2" breadcrumb={[{ label: "Presensi", href: "/attendance" }]} />,
    );
    expect(screen.getByRole("link", { name: "Presensi" })).toHaveAttribute("href", "/attendance");
  });

  it("collapses secondary actions into a named menu, and keeps destructive ones there", async () => {
    const onExport = vi.fn();
    const onArchive = vi.fn();
    render(
      <UiLabelsProvider labels={{ pageHeaderMoreActions: "More actions" }}>
        <PageHeader
          title="Pelanggaran"
          primaryAction={<Button>Catat</Button>}
          secondaryActions={[
            { label: "Unduh rekap", onSelect: onExport },
            { label: "Arsipkan", onSelect: onArchive, destructive: true },
          ]}
        />
      </UiLabelsProvider>,
    );
    // The wide-screen buttons hold only the non-destructive action.
    expect(screen.getByRole("button", { name: "Unduh rekap" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arsipkan" })).not.toBeInTheDocument();
    // Two menus: every action on a phone, the destructive one from 640px up.
    const [phoneMenu, wideMenu] = screen.getAllByRole("button", { name: "More actions" });
    if (!phoneMenu || !wideMenu) throw new Error("expected both overflow menus");
    await userEvent.click(phoneMenu);
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Unduh rekap", "Arsipkan"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Arsipkan" }));
    expect(onArchive).toHaveBeenCalledOnce();
    expect(onExport).not.toHaveBeenCalled();
  });

  // The rows come from DropdownMenuItem as they are: the menu's own height,
  // its danger tone (text, icon and highlight), and its icon sizing.
  it("renders overflow items through the menu's own icon and danger tone", async () => {
    render(
      <PageHeader
        title="X-A"
        secondaryActions={[
          { label: "Cetak", icon: <Printer />, onSelect: () => undefined },
          { label: "Arsipkan", icon: <Trash2 />, onSelect: () => undefined, destructive: true },
          { label: "Riwayat", href: "/history" },
        ]}
      />,
    );
    const [phoneMenu] = screen.getAllByRole("button", { name: "Aksi lainnya" });
    if (!phoneMenu) throw new Error("expected the overflow menu");
    await userEvent.click(phoneMenu);
    const menu = await screen.findByRole("menu");
    const archive = within(menu).getByRole("menuitem", { name: "Arsipkan" });
    expect(archive).toHaveClass("text-danger", "data-[highlighted]:bg-danger-soft");
    expect(archive).not.toHaveClass("min-h-11");
    expect(archive.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(within(menu).getByRole("menuitem", { name: "Cetak" })).not.toHaveClass("text-danger");
    // A link item renders as the link itself, its icon slot inside it.
    expect(within(menu).getByRole("menuitem", { name: "Riwayat" })).toHaveAttribute(
      "href",
      "/history",
    );
  });

  // Wide actions wrap under the title instead of squeezing it: the title
  // claims at least 16rem of a wrapping row, the actions may shrink and
  // wrap on their own line. Layout itself is checked in Storybook
  // ("Crowded actions"); here the classes that carry it.
  it("lets wide actions wrap under the title rather than squeeze it", () => {
    render(
      <PageHeader
        title="Penilaian"
        actions={
          <>
            <Button>Kelas</Button>
            <Button>Mapel</Button>
            <Button>Semester</Button>
          </>
        }
      />,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Penilaian" });
    const row = heading.parentElement;
    expect(row).toHaveClass("sm:flex-row", "sm:flex-wrap");
    expect(row?.className).not.toMatch(/grid-cols/);
    expect(heading).toHaveClass("min-w-0", "sm:basis-64", "sm:grow-999");
    const actions = screen.getByRole("button", { name: "Kelas" }).parentElement;
    expect(actions).toHaveClass("min-w-0", "flex-wrap", "sm:grow");
  });

  it("passes an id, a test id and a ref to its root", () => {
    const ref = createRef<HTMLDivElement>();
    render(<PageHeader ref={ref} id="top" data-testid="page-header" title="Siswa" />);
    expect(screen.getByTestId("page-header")).toBe(ref.current);
    expect(ref.current).toHaveAttribute("id", "top");
  });
});
