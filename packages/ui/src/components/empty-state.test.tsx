import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Card } from "./card.js";
import { EmptyState, EmptyStateInlineScope } from "./empty-state.js";
import { FilteredEmptyState } from "./filtered-empty-state.js";
import { FirstUseEmptyState } from "./first-use-empty-state.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("EmptyState", () => {
  it("draws its own frame on a page, with the icon, title, description and actions", async () => {
    const { container } = render(
      <EmptyState
        icon={<Inbox />}
        title="Belum ada izin"
        description="Izin yang diajukan akan muncul di sini."
        action={<button type="button">Ajukan izin</button>}
        secondaryAction={<a href="/help">Pelajari</a>}
      />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass("rounded-lg", "border", "bg-surface");
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass("size-12");
    expect(screen.getByText("Belum ada izin")).toHaveClass("text-heading");
    expect(screen.getByRole("button", { name: "Ajukan izin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pelajari" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("drops the frame inside a Card or an inline scope, unless asked for one", () => {
    render(
      <>
        <Card>
          <EmptyState title="Di kartu" />
        </Card>
        <EmptyStateInlineScope>
          <EmptyState title="Di tabel" />
        </EmptyStateInlineScope>
        <Card>
          <EmptyState title="Tetap berbingkai" variant="framed" />
        </Card>
      </>,
    );
    expect(screen.getByText("Di kartu").parentElement?.parentElement).not.toHaveClass("rounded-lg");
    expect(screen.getByText("Di tabel").parentElement?.parentElement).not.toHaveClass("rounded-lg");
    expect(screen.getByText("Tetap berbingkai").parentElement?.parentElement).toHaveClass(
      "rounded-lg",
    );
  });

  it("lays the compact variant out as one left-aligned row", () => {
    render(<EmptyState variant="compact" icon={<Inbox />} title="Belum ada pengumuman" />);
    const title = screen.getByText("Belum ada pengumuman");
    expect(title).toHaveClass("text-label");
    expect(title.parentElement?.parentElement).toHaveClass("flex-row", "flex-wrap", "text-left");
  });

  // On a phone the compact row's button no longer squeezes the text into a
  // narrow column: it takes a line of its own, lined up with the text.
  it("puts the compact variant's action under the text on a phone", () => {
    const { rerender } = render(
      <EmptyState
        variant="compact"
        icon={<Inbox />}
        title="Tidak ada tamu terjadwal hari ini"
        action={<button type="button">Jadwalkan tamu</button>}
      />,
    );
    const actions = screen.getByRole("button", { name: "Jadwalkan tamu" }).parentElement;
    expect(actions).toHaveClass("shrink-0", "max-sm:basis-full", "max-sm:pl-11");
    rerender(
      <EmptyState
        variant="compact"
        title="Tidak ada tamu terjadwal hari ini"
        action={<button type="button">Jadwalkan tamu</button>}
      />,
    );
    // Without an icon there is nothing to line up past.
    expect(screen.getByRole("button", { name: "Jadwalkan tamu" }).parentElement).not.toHaveClass(
      "max-sm:pl-11",
    );
  });

  it("wraps the title and description without a one-word last line", () => {
    render(
      <EmptyState
        title="Belum ada tamu di sekolah"
        description="Tamu yang dicatat muncul di sini."
      />,
    );
    expect(screen.getByText("Belum ada tamu di sekolah")).toHaveClass("text-balance");
    expect(screen.getByText("Tamu yang dicatat muncul di sini.")).toHaveClass("text-pretty");
  });

  it("can title itself as a heading", () => {
    render(<EmptyState title="Belum ada data" titleAs="h3" />);
    expect(screen.getByRole("heading", { level: 3, name: "Belum ada data" })).toBeInTheDocument();
  });

  it("can stand in as the page heading", () => {
    render(<EmptyState title="Judul tidak ditemukan" titleAs="h1" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Judul tidak ditemukan" }),
    ).toBeInTheDocument();
  });
});

describe("FilteredEmptyState", () => {
  it("uses the UiLabels copy and resets the filters", async () => {
    const onReset = vi.fn();
    render(
      <UiLabelsProvider
        labels={{
          emptyFilteredTitle: "No matches",
          emptyFilteredDescription: "Try another search.",
          emptyFilteredReset: "Clear filters",
        }}
      >
        <FilteredEmptyState onReset={onReset} />
      </UiLabelsProvider>,
    );
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByText("Try another search.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  // A list with only filters offers no keyword to change.
  it("drops the keyword hint on a list with no search box", () => {
    const { rerender } = render(<FilteredEmptyState searchable={false} />);
    expect(screen.getByText("Ubah atau hapus filter yang aktif.")).toBeInTheDocument();
    expect(screen.queryByText(/kata kunci/)).not.toBeInTheDocument();

    rerender(<FilteredEmptyState />);
    expect(
      screen.getByText("Coba kata kunci lain atau hapus filter yang aktif."),
    ).toBeInTheDocument();
  });

  it("has no button without a reset handler", () => {
    render(<FilteredEmptyState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("passes element props to the root", () => {
    render(<FilteredEmptyState data-testid="no-match" id="no-match" />);
    expect(screen.getByTestId("no-match")).toHaveAttribute("id", "no-match");
  });
});

describe("FirstUseEmptyState", () => {
  it("always offers the add action, as the outline button with a plus by default", async () => {
    const onAction = vi.fn();
    const { container } = render(
      <FirstUseEmptyState
        title="Belum ada siswa"
        description="Tambahkan siswa pertama untuk mulai mencatat presensi."
        actionLabel="Tambah siswa"
        onAction={onAction}
      />,
    );
    const button = screen.getByRole("button", { name: "Tambah siswa" });
    // The page header carries the filled primary for the same action.
    expect(button).not.toHaveClass("bg-accent");
    expect(button).toHaveClass("border-border");
    expect(button.querySelector("svg.lucide-plus")).toBeInTheDocument();
    await userEvent.click(button);
    expect(onAction).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it("fills the button when it carries the screen's only primary", () => {
    render(
      <FirstUseEmptyState
        emphasis="primary"
        title="Belum ada siswa"
        actionLabel="Tambah siswa"
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Tambah siswa" })).toHaveClass("bg-accent");
  });

  it("links to a create page instead, with a smaller button in the compact variant", () => {
    render(
      <FirstUseEmptyState
        variant="compact"
        title="Belum ada pengumuman"
        actionLabel="Buat pengumuman"
        href="/announcements/new"
      />,
    );
    const link = screen.getByRole("link", { name: "Buat pengumuman" });
    expect(link).toHaveAttribute("href", "/announcements/new");
    expect(link).toHaveClass("h-8");
  });
});
