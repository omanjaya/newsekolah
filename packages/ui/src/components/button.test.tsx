import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Button } from "./button.js";

describe("Button", () => {
  it("renders its label and responds to clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Simpan presensi</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Simpan presensi" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables the button and marks it busy while loading", () => {
    render(<Button loading>Menyimpan</Button>);
    const button = screen.getByRole("button", { name: "Menyimpan" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("stays disabled while loading even when the caller passes disabled={false}", async () => {
    const onClick = vi.fn();
    render(
      <Button loading disabled={false} onClick={onClick}>
        Menyimpan
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Menyimpan" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it never submits a form by accident", async () => {
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Button>Tambah baris</Button>
        <Button type="submit">Simpan</Button>
      </form>,
    );
    expect(screen.getByRole("button", { name: "Tambah baris" })).toHaveAttribute("type", "button");

    await userEvent.click(screen.getByRole("button", { name: "Tambah baris" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("gives press feedback through the motion-press utility", () => {
    render(<Button>Simpan</Button>);
    expect(screen.getByRole("button", { name: "Simpan" })).toHaveClass("motion-press");
  });

  it("marks a disabled asChild link with aria-disabled instead of a type or disabled attribute", () => {
    render(
      <Button asChild disabled>
        <a href="/somewhere">Buka</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Buka" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("type");
    expect(link).not.toHaveAttribute("disabled");
  });

  it("takes a disabled asChild link out of the tab order and ignores Enter", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button asChild loading onClick={onClick}>
          <a href="#next">Buka</a>
        </Button>
        <button type="button">Berikutnya</button>
      </>,
    );
    const link = screen.getByRole("link", { name: "Buka" });
    expect(link).toHaveAttribute("tabindex", "-1");

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Berikutnya" })).toHaveFocus();

    link.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    expect(window.location.hash).not.toBe("#next");
  });

  it("keeps an enabled asChild link focusable and clickable", async () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <Button asChild onClick={onClick}>
        <a href="#next">Buka</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Buka" });
    expect(link).not.toHaveAttribute("tabindex");
    await userEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lays its hover and press state over the secondary surface instead of replacing it", () => {
    render(<Button variant="secondary">Batal</Button>);
    const button = screen.getByRole("button", { name: "Batal" });
    // `bg-surface` stays the only background; `state-layer` paints on top.
    expect(button).toHaveClass("bg-surface", "state-layer");
    expect(button.className).not.toMatch(/(hover|active):bg-/);
  });

  it("never wraps its label inside the fixed height", () => {
    render(<Button>Unduh daftar siswa</Button>);
    expect(screen.getByRole("button", { name: "Unduh daftar siswa" })).toHaveClass(
      "whitespace-nowrap",
    );
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Simpan
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shares the fields' heights, 32 and 36, and grows to 44 wherever they do", () => {
    render(
      <>
        <Button size="sm">Kecil</Button>
        <Button>Sedang</Button>
      </>,
    );
    // FIELD_HEIGHT: 44px unless the pointer is fine on a screen from md up.
    expect(screen.getByRole("button", { name: "Kecil" })).toHaveClass(
      "h-8",
      "max-md:min-h-11",
      "pointer-coarse:min-h-11",
    );
    expect(screen.getByRole("button", { name: "Sedang" })).toHaveClass(
      "h-9",
      "max-md:min-h-11",
      "pointer-coarse:min-h-11",
    );
    expect(screen.getByRole("button", { name: "Kecil" }).className).not.toMatch(/\bmd:h-/);
  });

  it("lets a caller's taller height win over the size", () => {
    render(<Button className="h-16">Pindai</Button>);
    const button = screen.getByRole("button", { name: "Pindai" });
    expect(button).toHaveClass("h-16");
    expect(button).not.toHaveClass("h-9");
  });

  it("marks itself so a dialog's action row can hold it to the fields' height", () => {
    render(<Button size="sm">Batal</Button>);
    expect(screen.getByRole("button", { name: "Batal" })).toHaveAttribute("data-slot", "button");
  });

  it("has a large size for the one main action on a phone screen", () => {
    render(<Button size="lg">Pindai dengan kamera</Button>);
    expect(screen.getByRole("button", { name: "Pindai dengan kamera" })).toHaveClass("h-12");
  });

  it("draws the link variant as text that does not press", () => {
    render(<Button variant="link">Lihat semua</Button>);
    const link = screen.getByRole("button", { name: "Lihat semua" });
    expect(link).toHaveClass("text-accent", "h-auto", "px-0");
    expect(link).not.toHaveClass("motion-press");
    // 18px label line + 14px above and below: 46px, past the 44px minimum.
    expect(link).toHaveClass("pointer-coarse:after:-inset-y-3.5");
  });

  it("tightens the leading padding next to an icon", () => {
    render(<Button icon={<svg />}>Tambah</Button>);
    expect(screen.getByRole("button", { name: "Tambah" })).toHaveClass("pl-3.5");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Button>Simpan presensi</Button>);
    await expectNoAxeViolations(container);
  });

  it("renders as the child element when asChild is set, keeping the icon slot", () => {
    render(
      <Button asChild icon={<span data-testid="icon" />}>
        <a href="/somewhere">Buka</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: /buka/i });
    expect(link).toHaveAttribute("href", "/somewhere");
    expect(within(link).getByTestId("icon")).toBeInTheDocument();
  });
});
