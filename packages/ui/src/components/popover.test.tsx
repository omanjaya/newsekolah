import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Button } from "./button.js";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./popover.js";

function Harness() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Filter</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Filter izin">
        <p>Hanya yang menunggu</p>
        <PopoverClose asChild>
          <Button>Terapkan</Button>
        </PopoverClose>
      </PopoverContent>
    </Popover>
  );
}

describe("Popover", () => {
  it("opens from its trigger and closes through PopoverClose", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(await screen.findByText("Hanya yang menunggu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));
    await waitFor(() => expect(screen.queryByText("Hanya yang menunggu")).not.toBeInTheDocument());
  });

  it("is the raised surface, above dialogs", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog", { name: "Filter izin" });
    expect(panel).toHaveClass("z-popover", "bg-surface-raised", "rounded-md", "shadow-2");
  });

  it("has no accessibility violations when open", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await expectNoAxeViolations(await screen.findByRole("dialog", { name: "Filter izin" }));
  });
});
