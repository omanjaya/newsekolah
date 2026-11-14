import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Card, CardContent, CardHeader, CardTitle } from "./card.js";
import { Dialog, DialogContent } from "./dialog.js";
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
