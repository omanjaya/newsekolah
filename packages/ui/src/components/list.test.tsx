import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Card, CardHeader, CardTitle } from "./card.js";
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

  it("spans a card and lines up with its header", () => {
    render(
      <Card>
        <CardHeader data-testid="header">
          <CardTitle>Hari ini</CardTitle>
        </CardHeader>
        <List variant="inset">
          <ListRow title="Matematika" />
        </List>
      </Card>,
    );
    expect(screen.getByRole("list")).toHaveClass("[--list-inset:20px]");
    expect(screen.getByRole("list")).toHaveAttribute("data-card-flush");
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
