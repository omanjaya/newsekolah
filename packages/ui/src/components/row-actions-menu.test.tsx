import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RowActionsMenu } from "./row-actions-menu.js";

describe("RowActionsMenu", () => {
  it("hides its items until the trigger is opened", () => {
    render(
      <RowActionsMenu
        ariaLabel="Aksi untuk Judul A"
        items={[{ label: "Ubah", icon: <span />, onClick: vi.fn() }]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ubah" })).not.toBeInTheDocument();
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
    const deleteItem = await screen.findByRole("button", { name: "Hapus" });
    await user.click(deleteItem);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument(),
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
    const item = await screen.findByRole("button", { name: "Perpanjang" });
    expect(item).toBeDisabled();
  });
});
