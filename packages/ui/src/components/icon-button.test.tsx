import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { IconButton } from "./icon-button.js";

describe("IconButton", () => {
  it("is a round button named by its aria-label", async () => {
    const onClick = vi.fn();
    render(<IconButton icon={<svg />} aria-label="Notifikasi" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Notifikasi" });
    expect(button).toHaveClass("rounded-full");
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows its aria-label as a tooltip on keyboard focus, without repeating it as a description", async () => {
    render(<IconButton icon={<svg />} aria-label="Hapus baris" />);
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hapus baris");
    expect(screen.getByRole("button", { name: "Hapus baris" })).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("takes a different tooltip text, or none", async () => {
    const { unmount } = render(
      <IconButton icon={<svg />} aria-label="Hapus baris" tooltip="Hapus (Del)" />,
    );
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hapus (Del)");
    unmount();

    render(<IconButton icon={<svg />} aria-label="Hapus baris" tooltip={false} />);
    await userEvent.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("spins and stops taking clicks while loading", async () => {
    const onClick = vi.fn();
    render(<IconButton icon={<svg />} aria-label="Simpan" loading onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Simpan" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("grows to a 44px target on a touch screen at every size", () => {
    render(<IconButton icon={<svg />} aria-label="Cari" size="sm" />);
    expect(screen.getByRole("button", { name: "Cari" })).toHaveClass(
      "size-8",
      "pointer-coarse:min-h-11",
      "pointer-coarse:min-w-11",
    );
  });

  it("keeps the old outline variant working as the surface look", () => {
    render(<IconButton icon={<svg />} aria-label="Filter" variant="outline" />);
    expect(screen.getByRole("button", { name: "Filter" })).toHaveClass("bg-surface", "state-layer");
  });

  it("works as a menu trigger and does not flash its tooltip when the menu closes", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton icon={<svg />} aria-label="Aksi lain" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Ubah</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Aksi lain" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: "Ubah" })).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <IconButton icon={<svg />} aria-label="Notifikasi" variant="surface" />
        <IconButton icon={<svg />} aria-label="Tambah" variant="accent" />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
