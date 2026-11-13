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
