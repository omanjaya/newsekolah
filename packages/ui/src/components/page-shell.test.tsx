import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";
import { compiledSelector } from "../test/tailwind-selector.js";

import { Button } from "./button.js";
import { NavTabs } from "./nav-tabs.js";
import { PageHeader } from "./page-header.js";
import { PageShell, type PageShellVariant } from "./page-shell.js";

const TABS = [
  { href: "/attendance", label: "Presensi", current: true },
  { href: "/journal", label: "Jurnal mengajar" },
];

function slot(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector(`[data-slot="${name}"]`);
}

describe("PageShell", () => {
  it("lays the page out in reading order: breadcrumb, header, sub-navigation, toolbar, content", async () => {
    const { container } = render(
      <PageShell
        breadcrumb={[{ label: "Katalog", href: "/library/catalogue" }, { label: "Laskar Pelangi" }]}
        header={<PageHeader title="Laskar Pelangi" />}
        nav={<NavTabs aria-label="Bagian presensi" items={TABS} />}
        toolbar={<Button>Saring</Button>}
      >
        <p>Isi halaman</p>
      </PageShell>,
    );
    const order = [
      screen.getByRole("navigation", { name: "Navigasi halaman" }),
      screen.getByRole("heading", { level: 1, name: "Laskar Pelangi" }),
      screen.getByRole("navigation", { name: "Bagian presensi" }),
      screen.getByRole("button", { name: "Saring" }),
      screen.getByText("Isi halaman"),
    ];
    order.reduce((previous, current) => {
      expect(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      return current;
    });
    await expectNoAxeViolations(container);
  });

  it("keeps the sub-navigation in the head, directly under the header", () => {
    const { container } = render(
      <PageShell
        header={<PageHeader title="Presensi" />}
        nav={<NavTabs aria-label="Bagian presensi" items={TABS} />}
      >
        <p>Isi</p>
      </PageShell>,
    );
    const head = slot(container, "page-head");
    const nav = slot(container, "page-nav");
    expect(head).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(nav?.parentElement).toBe(head);
    expect(nav?.previousElementSibling).toContainElement(screen.getByRole("heading", { level: 1 }));
  });

  it("leaves no head behind when a single-item NavTabs renders nothing", async () => {
    const { container } = render(
      <PageShell nav={<NavTabs aria-label="Bagian" items={[{ href: "/a", label: "A" }]} />}>
        <p>Isi</p>
      </PageShell>,
    );
    const head = slot(container, "page-head");
    expect(slot(container, "page-nav")).toBeEmptyDOMElement();
    // The head hides itself when every part is empty, so no 24px gap stays.
    const hidden = await compiledSelector("[&:not(:has(>:not(:empty)))]:hidden");
    expect(head?.matches(hidden)).toBe(true);
  });

  it("animates the content once, on the wrapper, never the head or each child", () => {
    const { container } = render(
      <PageShell header={<PageHeader title="Pengguna" />} toolbar={<Button>Saring</Button>}>
        <section>Satu</section>
        <section>Dua</section>
      </PageShell>,
    );
    const content = slot(container, "page-content");
    expect(content).toHaveClass("animate-enter");
    expect(content).toContainElement(screen.getByRole("button", { name: "Saring" }));
    expect(slot(container, "page-head")).not.toHaveClass("animate-enter");
    expect(container.querySelectorAll(".animate-enter")).toHaveLength(1);
  });

  it("renders fixed elements outside the entering content", () => {
    const { container } = render(
      <PageShell floating={<div data-testid="save-bar" className="fixed" />}>
        <p>Isi</p>
      </PageShell>,
    );
    expect(slot(container, "page-content")).not.toContainElement(screen.getByTestId("save-bar"));
  });

  it("can skip the enter animation", () => {
    const { container } = render(
      <PageShell animate={false}>
        <p>Isi</p>
      </PageShell>,
    );
    expect(slot(container, "page-content")).not.toHaveClass("animate-enter");
  });

  it("sets the column width per variant", () => {
    const widths: Record<PageShellVariant, string> = {
      default: "max-w-default",
      wide: "max-w-wide",
      narrow: "max-w-narrow",
      fit: "max-w-wide",
    };
    for (const [variant, width] of Object.entries(widths) as [PageShellVariant, string][]) {
      const { container, unmount } = render(
        <PageShell variant={variant}>
          <p>Isi</p>
        </PageShell>,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root).toHaveAttribute("data-variant", variant);
      expect(root).toHaveClass("px-4", "py-4", "md:px-6", "md:py-6");
      expect(root.firstElementChild).toHaveClass(width, "mx-auto", "gap-6");
      unmount();
    }
  });

  it("fits the viewport under the app's sticky chrome and lets the content take the rest", () => {
    const { container } = render(
      <PageShell variant="fit" header={<PageHeader title="Kelas" />}>
        <div>Tabel</div>
      </PageShell>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("md:h-[calc(100dvh-var(--page-offset-top,0px))]");
    expect(slot(container, "page-content")).toHaveClass("md:min-h-0", "md:flex-1");
    expect(slot(container, "page-body")).toHaveClass("md:min-h-0", "md:flex-1");
  });

  it("scrolls with the page in the other variants", () => {
    const { container } = render(
      <PageShell>
        <div>Isi</div>
      </PageShell>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/h-\[calc/);
    expect(slot(container, "page-body")).not.toHaveClass("md:flex-1");
  });

  it("passes attributes and the ref to the root", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <PageShell ref={ref} id="page" aria-busy="true" className="custom">
        <p>Isi</p>
      </PageShell>,
    );
    expect(ref.current).toHaveAttribute("id", "page");
    expect(ref.current).toHaveAttribute("aria-busy", "true");
    expect(ref.current).toHaveClass("custom");
  });
});
