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
