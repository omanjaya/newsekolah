import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, type AnchorHTMLAttributes } from "react";
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
});
