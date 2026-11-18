import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";

function Menu({ onLogout = vi.fn() }: { onLogout?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Akun</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Admin Contoh</DropdownMenuLabel>
        <DropdownMenuItem icon={<svg data-testid="icon" />} shortcut="Ctrl ,">
          Pengaturan
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem checked>Tabel padat</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={onLogout}>
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("opens from its trigger and runs an item's action", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(<Menu onLogout={onLogout} />);
    await user.click(screen.getByRole("button", { name: "Akun" }));
    await user.click(await screen.findByRole("menuitem", { name: "Keluar" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("keeps the shortcut hint out of the item's accessible name", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(screen.getByRole("button", { name: "Akun" }));
    const item = await screen.findByRole("menuitem", { name: "Pengaturan" });
    expect(item).toHaveTextContent("Ctrl ,");
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("is 36px under a mouse and 44px on a touch screen, with a danger tone", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(screen.getByRole("button", { name: "Akun" }));
    const item = await screen.findByRole("menuitem", { name: "Pengaturan" });
    expect(item).toHaveClass("h-9", "pointer-coarse:h-11");
    expect(screen.getByRole("menuitem", { name: "Keluar" })).toHaveClass("text-danger");
    expect(screen.getByRole("menuitemcheckbox", { name: "Tabel padat" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("keys the press layer to the highlighted state, so it sorts after the hover tint", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(screen.getByRole("button", { name: "Akun" }));
    const item = await screen.findByRole("menuitem", { name: "Pengaturan" });
    expect(item).toHaveClass("data-[highlighted]:active:bg-state-pressed");
    // A bare `active:` rule loses to `data-[highlighted]:` at equal specificity.
    expect(item).not.toHaveClass("active:bg-state-pressed");
    const danger = screen.getByRole("menuitem", { name: "Keluar" });
    expect(danger).toHaveClass("data-[highlighted]:active:bg-danger-soft");
    expect(danger).not.toHaveClass("data-[highlighted]:active:bg-state-pressed");
  });

  it("has no accessibility violations when open", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(screen.getByRole("button", { name: "Akun" }));
    await expectNoAxeViolations(await screen.findByRole("menu"));
  });
});
