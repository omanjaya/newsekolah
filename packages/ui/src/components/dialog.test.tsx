import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button.js";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./dialog.js";

function DialogHarness() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Buka dialog</Button>
      </DialogTrigger>
      <DialogContent title="Terbitkan izin keluar">
        <input aria-label="Tujuan" />
        <DialogClose asChild>
          <Button>Tutup</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("moves focus into the dialog when it opens", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Buka dialog" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Buka dialog" });
    await userEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes via the Close button", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Buka dialog" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
