import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Card } from "./card.js";
import { EmptyState, EmptyStateInlineScope } from "./empty-state.js";
import { FilteredEmptyState } from "./filtered-empty-state.js";
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
    expect(title.parentElement?.parentElement).toHaveClass("flex-row", "text-left");
  });

  it("can title itself as a heading", () => {
    render(<EmptyState title="Belum ada data" titleAs="h3" />);
    expect(screen.getByRole("heading", { level: 3, name: "Belum ada data" })).toBeInTheDocument();
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

  it("has no button without a reset handler", () => {
    render(<FilteredEmptyState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
