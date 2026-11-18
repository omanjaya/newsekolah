import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { RowActionsMenu } from "./row-actions-menu.js";

describe("RowActionsMenu", () => {
  it("hides its items until the trigger is opened", () => {
    render(
      <RowActionsMenu
        ariaLabel="Aksi untuk Judul A"
        items={[{ label: "Ubah", icon: <span />, onClick: vi.fn() }]}
      />,
    );
    expect(screen.queryByRole("menuitem", { name: "Ubah" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aksi untuk Judul A" })).toBeInTheDocument();
  });

  it("runs the item's onClick and closes the menu", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <RowActionsMenu
        ariaLabel="Aksi untuk Judul A"
        items={[
          { label: "Ubah", icon: <span />, onClick: onEdit },
          { label: "Hapus", icon: <span />, onClick: onDelete, tone: "danger" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Aksi untuk Judul A" }));
    const deleteItem = await screen.findByRole("menuitem", { name: "Hapus" });
    await user.click(deleteItem);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: "Hapus" })).not.toBeInTheDocument(),
    );
  });

  it("does not fire a disabled item's onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <RowActionsMenu
        ariaLabel="Aksi untuk Judul A"
        items={[{ label: "Perpanjang", icon: <span />, onClick, disabled: true }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Aksi untuk Judul A" }));
    const item = await screen.findByRole("menuitem", { name: "Perpanjang" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    await user.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is a real menu: arrow keys move between actions and Escape returns focus", async () => {
    const user = userEvent.setup();
    render(
      <RowActionsMenu
        ariaLabel="Aksi untuk Judul A"
        items={[
          { label: "Ubah", icon: <span />, onClick: vi.fn() },
          { label: "Cetak", icon: <span />, onClick: vi.fn() },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Aksi untuk Judul A" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Ubah" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Cetak" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("sets destructive actions apart with a separator and the danger tone", async () => {
    const user = userEvent.setup();
    render(
      <RowActionsMenu
        ariaLabel="Aksi untuk Judul A"
        items={[
          { label: "Ubah", icon: <span />, onClick: vi.fn() },
          { label: "Hapus", icon: <span />, onClick: vi.fn(), tone: "danger" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Aksi untuk Judul A" }));
    expect(await screen.findByRole("separator")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Hapus" })).toHaveClass("text-danger");
  });

  it("has no accessibility violations when open", async () => {
    const user = userEvent.setup();
    render(
      <RowActionsMenu
        ariaLabel="Aksi untuk Judul A"
        items={[{ label: "Ubah", icon: <span />, onClick: vi.fn() }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Aksi untuk Judul A" }));
    await expectNoAxeViolations(await screen.findByRole("menu"));
  });
});
