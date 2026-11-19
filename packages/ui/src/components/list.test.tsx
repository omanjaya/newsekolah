import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Ellipsis } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Badge } from "./badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "./card.js";
import { Dialog, DialogContent } from "./dialog.js";
import { IconButton } from "./icon-button.js";
import { ListRow } from "./list-row.js";
import { List } from "./list.js";
import { SectionHeader } from "./section-header.js";

describe("List and ListRow", () => {
  it("is a list of rows with title, meta and trailing value", async () => {
    const { container } = render(
      <List framed>
        <ListRow title="Bahasa Indonesia" meta="Bu Rina" trailing="Ruang X-A" />
        <ListRow title="Fisika" trailing="Lab IPA" />
      </List>,
    );
    const list = screen.getByRole("list");
    expect(list).toHaveClass("rounded-lg", "border", "overflow-hidden");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Bahasa Indonesia")).toHaveClass("text-body", "font-semibold");
    expect(screen.getByText("Ruang X-A")).toHaveClass("text-caption");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("keeps each fact of a meta list whole, joined with a middle dot", () => {
    render(
      <List>
        <ListRow title="Apotek" meta={["Kam, 19 Nov 2026", "keluar 15.49", undefined, ""]} />
        <ListRow title="Rumah" meta={[undefined, ""]} />
      </List>,
    );
    const time = screen.getByText("keluar 15.49");
    expect(time).toHaveClass("truncate");
    expect(time.closest("div")).toHaveTextContent(/^Kam, 19 Nov 2026 · keluar 15\.49$/);
    // Nothing to say: no empty meta line under the title.
    const [, empty] = screen.getAllByRole("listitem");
    expect(empty?.querySelector(".text-fg-muted")).toBeNull();
  });

  it("ends a fact wider than the row in an ellipsis instead of clipping it", () => {
    const long = "Dijemput oleh wali murid di gerbang depan sekolah setelah jam pelajaran";
    render(
      <List>
        <ListRow title="Apotek" meta={["Kam, 19 Nov 2026", long]} />
      </List>,
    );
    // Shrinks to the row (max-w-full) and ends in an ellipsis (truncate),
    // as a box of its own so the clamp of the meta line cannot cut it.
    const fact = screen.getByText(long);
    expect(fact).toHaveClass("min-w-0", "truncate");
    expect(fact.parentElement).toHaveClass("inline-flex", "max-w-full");
  });

  // At 320px a wrapped line opened with an orphan "·".
  it("keeps the separator at the end of a fact, so a wrapped line never opens with it", () => {
    render(
      <List>
        <ListRow title="Apotek" meta={["Kam, 19 Nov", "keluar 15.49"]} />
      </List>,
    );
    const first = screen.getByText("Kam, 19 Nov");
    const box = first.parentElement;
    // The separator shares the first fact's unbreakable box and does not shrink.
    expect(box).toHaveTextContent(/^Kam, 19 Nov ·$/);
    expect(box?.lastElementChild).toHaveClass("shrink-0");
    // The only break opportunity is the plain space after it.
    expect(box?.nextSibling?.textContent).toBe(" ");
    // The last fact has no trailing separator.
    expect(screen.getByText("keluar 15.49").parentElement).toHaveTextContent(/^keluar 15\.49$/);
  });

  // At 320px in English "19 Nov 2025" was cut to "19 Nov…" beside a
  // "Completed" badge; giving the badge leave to shrink then cut
  // "Kedaluwarsa" to its dot; letting only the date set the text's floor
  // then cut "Diajukan pukul 15.49" to "Diajukan puk…" and the destination
  // to "Puskesmas…" beside "Ditolak". No fact, nor the badge, may be cut:
  // the badge moves under the text instead (measured in Chromium at
  // 320-414px on the exit history).
  it("with keepMetaWhole, keeps every fact and the badge whole, wrapping the badge", () => {
    render(
      <List>
        <ListRow
          title="Puskesmas, kontrol gigi"
          titleLines={2}
          meta={["Kam, 19 Nov", "Diajukan pukul 15.49"]}
          keepMetaWhole
          trailing={<Badge dot>Kedaluwarsa</Badge>}
          onClick={() => undefined}
        />
        <ListRow
          title="Rumah"
          meta={["19 Nov 2025", "keluar 15.49"]}
          trailing={<Badge dot>Completed</Badge>}
          onClick={() => undefined}
        />
      </List>,
    );
    const [kept, plain] = screen.getAllByRole("listitem");
    if (!kept || !plain) throw new Error("two rows expected");

    // The text and the badge share a wrapping line: out of room, the badge
    // moves under the text rather than shrinking.
    const body = kept.querySelector("[data-slot=list-row-body]");
    expect(body).toHaveClass("flex", "flex-wrap", "min-w-0", "flex-1");
    const keptTitle = kept.querySelector("p");
    const column = keptTitle?.parentElement;
    expect(column?.parentElement).toBe(body);

    // The text column asks for its min-content width (flex-basis auto with
    // width: min-content), capped at the row, and grows into its line. A
    // zero flex-basis (flex-1) would let it shrink beside the badge.
    expect(column).toHaveClass("w-min", "max-w-full", "grow", "min-w-0");
    expect(column).not.toHaveClass("flex-1");
    expect(column).not.toHaveClass("min-w-min");
    // The title asks for 8rem of that width, never its whole length, and is
    // stretched back to the column, where it takes two lines.
    expect(keptTitle).toHaveClass("w-32", "min-w-full", "max-w-full", "line-clamp-2");
    // Every fact is one unbreakable box that counts at its full width in
    // the column's min-content: the date and the request time alike. Only a
    // fact wider than the whole row ends in an ellipsis.
    for (const text of ["Kam, 19 Nov", "Diajukan pukul 15.49"]) {
      const fact = within(kept).getByText(text);
      expect(fact).toHaveClass("min-w-0", "truncate");
      expect(fact.parentElement).toHaveAttribute("data-meta-fact");
      expect(fact.parentElement).toHaveClass("inline-flex", "max-w-full");
      expect(fact.parentElement?.className).not.toMatch(/grid|minmax\(0/);
    }

    // The badge keeps its width: nothing lets it shrink.
    const trailing = kept.querySelector("[data-slot=list-row-trailing]");
    expect(trailing).toHaveClass("*:shrink-0");
    expect(trailing?.className).not.toMatch(/data-slot=badge\]\]:(shrink|min-w-0)/);
    expect(trailing?.parentElement).toBe(body);

    // Without it the row is as before: no wrapping body, the text column
    // shrinks freely and so does every fact.
    expect(plain.querySelector("[data-slot=list-row-body]")).toBeNull();
    const plainTitle = plain.querySelector("p");
    expect(plainTitle?.parentElement).toHaveClass("min-w-0", "flex-1");
    expect(plainTitle?.parentElement).not.toHaveClass("w-min");
    expect(plainTitle).not.toHaveClass("w-32");
    const plainDate = within(plain).getByText("19 Nov 2025");
    expect(plainDate).toHaveClass("min-w-0", "truncate");
  });

  it("truncates the title to one line unless it may take two", () => {
    render(
      <List>
        <ListRow title="Laskar Pelangi" />
        <ListRow title="Sapiens: Riwayat Singkat Umat Manusia" titleLines={2} />
        <ListRow href="/opac/2" title="Bumi Manusia: Tetralogi Buru" titleLines={2} />
      </List>,
    );
    expect(screen.getByText("Laskar Pelangi")).toHaveClass("truncate");
    const wrapped = screen.getByText("Sapiens: Riwayat Singkat Umat Manusia");
    expect(wrapped).toHaveClass("line-clamp-2");
    expect(wrapped).not.toHaveClass("truncate");
    // A link target clamps itself, so the row stays one target.
    expect(screen.getByRole("link", { name: "Bumi Manusia: Tetralogi Buru" })).toHaveClass(
      "line-clamp-2",
    );
  });

  it("ends a one-line row target in an ellipsis instead of clipping it mid-word", () => {
    render(
      <List>
        <ListRow onClick={() => undefined} title="Puskesmas, kontrol gigi" />
        <ListRow href="/opac/1" title="Laskar Pelangi" />
      </List>,
    );
    // The paragraph's ellipsis cannot reach into an inline link or button
    // (the browser clips that box whole), so the target is a block of the
    // row's width that truncates its own text.
    for (const target of [
      screen.getByRole("button", { name: "Puskesmas, kontrol gigi" }),
      screen.getByRole("link", { name: "Laskar Pelangi" }),
    ]) {
      expect(target).toHaveClass("block", "w-full", "truncate");
      expect(target).not.toHaveClass("line-clamp-2");
    }
  });

  it("gives the trailing slot no box, so a child hidden at some width leaves no gap", () => {
    const { container } = render(
      <List>
        <ListRow
          title="Laskar Pelangi"
          trailing={<span className="hidden sm:inline">3 eksemplar</span>}
        />
        <ListRow title="Fisika" />
      </List>,
    );
    const trailing = container.querySelector("[data-slot=list-row-trailing]");
    expect(trailing).toHaveClass("contents", "*:shrink-0");
    expect(trailing).toContainElement(screen.getByText("3 eksemplar"));
    // A row without a trailing value renders no slot at all.
    expect(container.querySelectorAll("[data-slot=list-row-trailing]")).toHaveLength(1);
  });

  it("makes a row one link named by its title, with a chevron", async () => {
    const { container } = render(
      <List>
        <ListRow href="/students/1" title="Nadia Putri" meta="X-A · 3 kali alfa" />
      </List>,
    );
    const link = screen.getByRole("link", { name: "Nadia Putri" });
    expect(link).toHaveAttribute("href", "/students/1");
    expect(link).toHaveAccessibleDescription("X-A · 3 kali alfa");
    expect(screen.getByRole("listitem")).toHaveClass("hover:bg-state-hover", "cursor-pointer");
    expect(container.querySelector("svg.lucide-chevron-right")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("keeps a row action a separate target and marks the selected row", async () => {
    const onOpen = vi.fn();
    const onMenu = vi.fn();
    render(
      <List>
        <ListRow
          onClick={onOpen}
          selected
          title="Sari Dewi"
          action={
            <button type="button" onClick={onMenu}>
              Aksi
            </button>
          }
        />
      </List>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));
    expect(onMenu).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    const row = screen.getByRole("button", { name: "Sari Dewi" });
    expect(row).toHaveAttribute("aria-current", "true");
    await userEvent.click(row);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole("listitem")).toHaveClass("bg-state-selected");
  });

  // A row menu sits under the chevrons of the rows around it: its glyph
  // centred on theirs and as muted. A text button keeps its own box.
  it("sets a lone icon action like the chevron, and leaves a text action alone", () => {
    render(
      <List>
        <ListRow
          title="Sari Dewi"
          action={<IconButton size="sm" aria-label="Aksi" icon={<Ellipsis />} tooltip={false} />}
        />
        <ListRow title="Budi" action={<button type="button">Kembalikan</button>} />
      </List>,
    );
    const slot = screen.getByRole("button", { name: "Aksi" }).parentElement;
    expect(slot).toHaveAttribute("data-slot", "list-row-action");
    expect(slot).toHaveClass(
      "[&>button[aria-label]:has(>svg:only-child)]:-mr-2",
      "pointer-coarse:[&>button[aria-label]:has(>svg:only-child)]:-mr-3.5",
      "[&>button[aria-label]:has(>svg:only-child)]:text-fg-muted",
    );
    const iconButton = screen.getByRole("button", { name: "Aksi" });
    expect(iconButton.matches("button[aria-label]:has(>svg:only-child)")).toBe(true);
    const textButton = screen.getByRole("button", { name: "Kembalikan" });
    expect(textButton.matches("button[aria-label]:has(>svg:only-child)")).toBe(false);
  });

  it("disables a row", () => {
    render(
      <List>
        <ListRow href="/x" disabled title="Diarsipkan" />
      </List>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diarsipkan" })).toBeDisabled();
  });

  // styles.css spans a list across a card only when it is a direct child
  // (`[data-slot=card][data-card-padding] > [data-card-flush]`), so the
  // card says its padding and the list marks itself; nothing about the
  // list's own classes depends on a card being somewhere above it.
  it("marks itself for the card's flush rule and the card says its padding", () => {
    render(
      <Card padding="md">
        <CardHeader>
          <CardTitle>Hari ini</CardTitle>
        </CardHeader>
        <List variant="inset">
          <ListRow title="Matematika" />
        </List>
      </Card>,
    );
    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("data-card-flush");
    expect(list.parentElement).toHaveAttribute("data-slot", "card");
    expect(list.parentElement).toHaveAttribute("data-card-padding", "md");
  });

  it("renders the same list at any depth, in a card section or a dialog opened from a card", async () => {
    const bare = render(
      <List>
        <ListRow title="Matematika" />
      </List>,
    );
    const bareClass = screen.getByRole("list").className;
    bare.unmount();

    render(
      <Card padding="md">
        <CardContent>
          <List aria-label="in content">
            <ListRow title="Matematika" />
          </List>
        </CardContent>
        <div className="grid grid-cols-2">
          <List aria-label="in a column">
            <ListRow title="Fisika" />
          </List>
        </div>
        <Dialog open>
          <DialogContent title="Rincian">
            <List aria-label="in a dialog">
              <ListRow title="Kimia" />
            </List>
          </DialogContent>
        </Dialog>
      </Card>,
    );
    // The open modal hides the card behind it from the accessibility tree.
    for (const name of ["in content", "in a column", "in a dialog"]) {
      const list = await screen.findByRole("list", { name, hidden: true });
      expect(list.className).toBe(bareClass);
      expect(list.parentElement).not.toHaveAttribute("data-slot", "card");
    }
  });

  it("does not take the card's flush rule when it draws its own frame", () => {
    render(
      <Card padding="md">
        <List framed>
          <ListRow title="Matematika" />
        </List>
      </Card>,
    );
    expect(screen.getByRole("list")).not.toHaveAttribute("data-card-flush");
  });

  it("runs onClick and follows href when a row has both", async () => {
    const onClick = vi.fn();
    render(
      <List>
        <ListRow href="#detail" onClick={onClick} title="Nadia Putri" />
      </List>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Nadia Putri" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("#detail");
  });

  it("forwards a ref to the list and to a row", () => {
    const listRef = createRef<HTMLUListElement>();
    const rowRef = createRef<HTMLLIElement>();
    render(
      <List ref={listRef}>
        <ListRow ref={rowRef} title="Matematika" />
      </List>,
    );
    expect(listRef.current).toBe(screen.getByRole("list"));
    expect(rowRef.current).toBe(screen.getByRole("listitem"));
  });
});

describe("SectionHeader", () => {
  it("titles a section as an h2 with a count and an action", async () => {
    const { container } = render(
      <SectionHeader
        title="Perlu tindakan"
        count={3}
        description="Izin dan jurnal yang menunggu Anda."
        action={<a href="/inbox">Buka antrean</a>}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Perlu tindakan" })).toHaveClass(
      "text-heading",
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka antrean" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
