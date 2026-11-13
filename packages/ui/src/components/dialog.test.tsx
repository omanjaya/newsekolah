import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Button } from "./button.js";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "./dialog.js";
import { UiLabelsProvider } from "./ui-labels.js";

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

  it("gives the close button a 44px touch target and the caller's localized label", () => {
    render(
      <Dialog open>
        <DialogContent title="Title" closeLabel="Close modal" />
      </Dialog>,
    );

    expect(screen.getByRole("button", { name: "Close modal" })).toHaveClass(
      "pointer-coarse:min-h-11",
      "pointer-coarse:min-w-11",
    );
  });

  it("takes the close label from UiLabels when the caller gives none", () => {
    render(
      <UiLabelsProvider labels={{ dialogClose: "Close dialog" }}>
        <Dialog open>
          <DialogContent title="Title">
            <p>Body</p>
          </DialogContent>
        </Dialog>
      </UiLabelsProvider>,
    );
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeInTheDocument();
  });

  it("is a bottom sheet below 640px and a centred card above, at the size asked for", () => {
    render(
      <Dialog open>
        <DialogContent title="Catat pelanggaran" size="lg">
          <p>Body</p>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    // jsdom has no media queries; this checks the classes that make both layouts.
    expect(dialog).toHaveClass("bottom-0", "rounded-t-xl", "max-h-[90dvh]", "max-sm:max-w-none");
    expect(dialog).toHaveClass("sm:top-1/2", "sm:left-1/2", "sm:rounded-lg", "max-w-[40rem]");
    expect(dialog.className).toMatch(/max-sm:data-\[state=open\]:animate-sheet-in/);
    expect(dialog.className).toMatch(/sm:data-\[state=open\]:animate-dialog-in/);
  });

  it("lets a caller's own width override the size", () => {
    render(
      <Dialog open>
        <DialogContent title="Pratinjau" className="max-w-3xl">
          <p>Body</p>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("max-w-3xl");
    expect(dialog).not.toHaveClass("max-w-[30rem]");
  });

  it("keeps the footer outside the scrolling body so it stays visible", () => {
    render(
      <Dialog open>
        <DialogContent title="Terbitkan" footer={<Button>Terbitkan</Button>}>
          <p>Isi panjang</p>
        </DialogContent>
      </Dialog>,
    );
    const body = screen.getByText("Isi panjang").parentElement;
    expect(body).toHaveClass("dialog-body", "overflow-y-auto");
    expect(body).not.toContainElement(screen.getByRole("button", { name: "Terbitkan" }));
  });

  it("marks DialogFooter so the body can drop its bottom padding for it", () => {
    render(
      <Dialog open>
        <DialogContent title="Catat">
          <form aria-label="Catatan">
            <input aria-label="Isi" />
            <DialogFooter>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>,
    );
    const footer = screen.getByRole("button", { name: "Simpan" }).parentElement;
    expect(footer).toHaveAttribute("data-dialog-footer");
    expect(footer).toHaveClass("sticky", "bottom-0");
    expect(within(screen.getByRole("form", { name: "Catatan" })).getByRole("button")).toBe(
      screen.getByRole("button", { name: "Simpan" }),
    );
  });

  it("does not point aria-describedby at a description that is not there", () => {
    render(
      <Dialog open>
        <DialogContent title="Tanpa deskripsi">
          <p>Body</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("describes itself with its description", () => {
    render(
      <Dialog open>
        <DialogContent title="Terbitkan izin" description="Izin berlaku selama jam yang dipilih.">
          <p>Body</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Izin berlaku selama jam yang dipilih.",
    );
  });

  it("has no accessibility violations", async () => {
    render(
      <Dialog open>
        <DialogContent
          title="Terbitkan izin keluar"
          description="Izin berlaku selama jam yang dipilih."
          footer={<Button>Terbitkan</Button>}
        >
          <label>
            Tujuan
            <input />
          </label>
        </DialogContent>
      </Dialog>,
    );
    await expectNoAxeViolations(screen.getByRole("dialog"));
  });
});
