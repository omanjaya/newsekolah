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

  it("draws the secondary ring as a border, which state-layer cannot paint over", () => {
    const { rerender } = render(
      <IconButton icon={<svg />} aria-label="Filter" variant="secondary" />,
    );
    const button = screen.getByRole("button", { name: "Filter" });
    expect(button).toHaveClass("border", "border-border", "bg-surface", "state-layer");
    // state-layer owns box-shadow, so a ring drawn as a shadow would vanish.
    expect(button.className).not.toMatch(/shadow-/);

    // A caller's border colour (a row with a note) now has a width to colour.
    rerender(
      <IconButton icon={<svg />} aria-label="Filter" variant="outline" className="border-accent" />,
    );
    expect(button).toHaveClass("border", "border-accent");
    expect(button).not.toHaveClass("border-border");
  });

  it("speaks Button's variant names and keeps the older ones as aliases", () => {
    render(
      <div>
        <IconButton icon={<svg />} aria-label="a" variant="secondary" />
        <IconButton icon={<svg />} aria-label="b" variant="surface" />
        <IconButton icon={<svg />} aria-label="c" variant="outline" />
        <IconButton icon={<svg />} aria-label="d" variant="primary" />
        <IconButton icon={<svg />} aria-label="e" variant="accent" />
      </div>,
    );
    const classOf = (name: string) => screen.getByRole("button", { name }).className;
    expect(classOf("b")).toBe(classOf("a"));
    expect(classOf("c")).toBe(classOf("a"));
    expect(classOf("e")).toBe(classOf("d"));
    expect(classOf("d")).toMatch(/\bbg-accent\b/);
  });

  it("keeps the same DOM node and focus while it turns disabled or busy and back", () => {
    const { rerender } = render(<IconButton icon={<svg />} aria-label="Naikkan" />);
    const button = screen.getByRole("button", { name: "Naikkan" });
    button.focus();

    rerender(<IconButton icon={<svg />} aria-label="Naikkan" disabled />);
    expect(screen.getByRole("button", { name: "Naikkan" })).toBe(button);
    rerender(<IconButton icon={<svg />} aria-label="Naikkan" />);
    expect(screen.getByRole("button", { name: "Naikkan" })).toBe(button);
    expect(button).toHaveFocus();

    rerender(<IconButton icon={<svg />} aria-label="Naikkan" loading />);
    expect(screen.getByRole("button", { name: "Naikkan" })).toBe(button);
    expect(button).toHaveFocus();
    rerender(<IconButton icon={<svg />} aria-label="Naikkan" />);
    expect(screen.getByRole("button", { name: "Naikkan" })).toBe(button);
    expect(button).toHaveFocus();
  });

  it("shows no tooltip while disabled and does not reopen it by itself afterwards", async () => {
    const { rerender } = render(<IconButton icon={<svg />} aria-label="Turunkan" />);
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    rerender(<IconButton icon={<svg />} aria-label="Turunkan" disabled />);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    rerender(<IconButton icon={<svg />} aria-label="Turunkan" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("turns a title into the tooltip instead of a second, native one", async () => {
    const { unmount } = render(
      <IconButton icon={<svg />} aria-label="3 belum dibaca" title="Notifikasi: 3 belum dibaca" />,
    );
    const button = screen.getByRole("button", { name: "3 belum dibaca" });
    expect(button).not.toHaveAttribute("title");
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Notifikasi: 3 belum dibaca");
    unmount();

    // Without a tooltip the title is the only hint, so it stays.
    render(<IconButton icon={<svg />} aria-label="Tutup" title="Tutup panel" tooltip={false} />);
    expect(screen.getByRole("button", { name: "Tutup" })).toHaveAttribute("title", "Tutup panel");
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
        <IconButton icon={<svg />} aria-label="Notifikasi" variant="secondary" />
        <IconButton icon={<svg />} aria-label="Tambah" variant="primary" />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
