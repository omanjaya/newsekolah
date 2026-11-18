import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../components/button.js";
import { CommandPalette } from "../components/command-palette.js";
import { ConfirmDialog } from "../components/confirm-dialog.js";
import { Dialog, DialogContent } from "../components/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/dropdown-menu.js";
import { IconButton } from "../components/icon-button.js";
import { Sheet, SheetContent } from "../components/sheet.js";

/** A dialog opened from state, the way nearly every dialog in apps/web is. */
function OpenedFromState({
  kind,
}: {
  kind: "dialog" | "sheet" | "drawer" | "confirm" | "palette";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Buka
      </Button>
      <input aria-label="Kolom lain" />
      {kind === "dialog" && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title="Ubah kelas">
            <input aria-label="Nama kelas" />
          </DialogContent>
        </Dialog>
      )}
      {(kind === "sheet" || kind === "drawer") && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent title="Rincian tagihan" side={kind === "drawer" ? "right" : "bottom"}>
            <input aria-label="Catatan" />
          </SheetContent>
        </Sheet>
      )}
      {kind === "confirm" && (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Hapus kelas?"
          onConfirm={() => undefined}
        />
      )}
      {kind === "palette" && (
        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          groups={[
            { heading: "Halaman", items: [{ id: "a", label: "Beranda", onSelect: vi.fn() }] },
          ]}
        />
      )}
    </>
  );
}

describe("focus return after a dialog opened from state", () => {
  it.each(["dialog", "sheet", "drawer", "confirm", "palette"] as const)(
    "%s: Escape puts focus back on the button that opened it",
    async (kind) => {
      const user = userEvent.setup();
      render(<OpenedFromState kind={kind} />);
      const opener = screen.getByRole("button", { name: "Buka" });
      await user.click(opener);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      await waitFor(() => expect(opener).not.toHaveFocus());

      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(opener).toHaveFocus());
    },
  );

  it("goes back to a field the reader was in when a shortcut opened the dialog", async () => {
    const user = userEvent.setup();
    function Shortcut() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <input
            aria-label="Cari siswa"
            onKeyDown={(event) => {
              if (event.key === "k" && event.ctrlKey) setOpen(true);
            }}
          />
          <CommandPalette open={open} onOpenChange={setOpen} groups={[]} />
        </>
      );
    }
    render(<Shortcut />);
    const field = screen.getByRole("textbox", { name: "Cari siswa" });
    field.focus();
    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(field).toHaveFocus());
  });

  it("goes back to the menu's trigger when a menu item opened the dialog", async () => {
    const user = userEvent.setup();
    function RowMenu() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<svg />} aria-label="Aksi untuk X-A" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onSelect={() => {
                  setOpen(true);
                }}
              >
                Ubah
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent title="Ubah kelas">
              <input aria-label="Nama kelas" />
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<RowMenu />);
    const trigger = screen.getByRole("button", { name: "Aksi untuk X-A" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: "Ubah" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement),
    );

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("leaves focus alone when the caller handles onCloseAutoFocus itself", async () => {
    const user = userEvent.setup();
    function Custom() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Buka
          </Button>
          <input aria-label="Tujuan" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
              title="Ubah kelas"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                screen.getByRole("textbox", { name: "Tujuan" }).focus();
              }}
            >
              <input aria-label="Nama kelas" />
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Custom />);
    await user.click(screen.getByRole("button", { name: "Buka" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Tujuan" })).toHaveFocus());
  });
});
