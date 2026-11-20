import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog, DialogContent } from "./dialog.js";
import { Sheet, SheetContent } from "./sheet.js";
import { Toaster, toast } from "./toast.js";

// sonner's pointer capture is stubbed for every test in src/test/setup.ts.

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

/**
 * A modal Radix overlay sets `pointer-events: none` on the body while it is
 * open. user-event refuses to click an element whose nearest declared
 * pointer-events is `none`, the way a real browser lets the click fall
 * through to the overlay behind it, so these tests fail unless the toaster
 * opts back in and the overlay ignores the press on the toast.
 */
describe("a toast action over an open modal overlay", () => {
  it("runs the undo and leaves the sheet open", async () => {
    const onUndo = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <>
        <Toaster />
        <Sheet open onOpenChange={onOpenChange}>
          <SheetContent title="Katalog pelanggaran" side="right">
            <p>Isi</p>
          </SheetContent>
        </Sheet>
      </>,
    );
    await waitFor(() => {
      expect(document.body.style.pointerEvents).toBe("none");
    });

    act(() => {
      toast.success("Terlambat dinonaktifkan", { action: { label: "Urungkan", onClick: onUndo } });
    });
    await userEvent.click(await screen.findByRole("button", { name: "Urungkan" }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Katalog pelanggaran" })).toBeInTheDocument();
  });

  it("runs the undo and leaves a dialog open, while a click on the scrim still closes it", async () => {
    const onUndo = vi.fn();
    const onOpenChange = vi.fn();
    const onInteractOutside = vi.fn();
    render(
      <>
        <Toaster />
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent title="Ubah jenis" onInteractOutside={onInteractOutside}>
            <p>Isi</p>
          </DialogContent>
        </Dialog>
      </>,
    );

    act(() => {
      toast.success("Perubahan disimpan", { action: { label: "Urungkan", onClick: onUndo } });
    });
    await userEvent.click(await screen.findByRole("button", { name: "Urungkan" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onInteractOutside).not.toHaveBeenCalled();

    // A click on the scrim still reaches the caller and dismisses.
    const scrim = document.querySelector("[data-overlay-scrim]");
    if (!scrim) throw new Error("scrim not found");
    await userEvent.click(scrim);
    expect(onInteractOutside).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
