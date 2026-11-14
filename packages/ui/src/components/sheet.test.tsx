import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";
import { endExitAnimation, playExitAnimations } from "../test/exit-animation.js";

import { Button } from "./button.js";
import { Sheet, SheetContent, SheetFooter, SheetTrigger } from "./sheet.js";

describe("Sheet", () => {
  it("uses a localized close control with a 44px touch target and a scrollable body", () => {
    render(
      <Sheet open>
        <SheetContent title="Actions" closeLabel="Close sheet">
          <div>Body</div>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("button", { name: "Close sheet" })).toHaveClass(
      "pointer-coarse:min-h-11",
      "pointer-coarse:min-w-11",
    );
    expect(screen.getByText("Body").parentElement).toHaveClass("overflow-y-auto");
  });

  it("opens from its trigger and closes on Escape", async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <Button>Aksi cepat</Button>
        </SheetTrigger>
        <SheetContent title="Aksi cepat">
          <p>Isi</p>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Aksi cepat" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("is a right-hand drawer from 640px up with side=right, and a bottom sheet below", () => {
    render(
      <Sheet open>
        <SheetContent title="Detail tagihan" side="right" size="lg">
          <p>Isi</p>
        </SheetContent>
      </Sheet>,
    );
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveAttribute("data-side", "right");
    expect(sheet).toHaveClass("bottom-0", "rounded-t-xl");
    expect(sheet).toHaveClass("sm:right-2", "sm:inset-y-2", "sm:rounded-xl", "sm:max-w-[36rem]");
    expect(sheet.className).toMatch(/sm:data-\[state=open\]:animate-drawer-in/);
  });

  it("keeps the footer prop outside the scrolling body, and SheetFooter sticky inside it", () => {
    render(
      <Sheet open>
        <SheetContent title="Catatan" footer={<Button>Kembali</Button>}>
          <form aria-label="Catatan">
            <SheetFooter>
              <Button type="submit">Simpan</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>,
    );
    const body = screen.getByRole("form", { name: "Catatan" }).parentElement;
    expect(body).not.toContainElement(screen.getByRole("button", { name: "Kembali" }));
    expect(screen.getByRole("button", { name: "Simpan" }).parentElement).toHaveClass("sticky");
  });

  it("keeps its scrim for the sheet's 200ms exit, then removes it", () => {
    const restore = playExitAnimations();
    try {
      const sheet = (open: boolean) => (
        <Sheet open={open}>
          <SheetContent title="Aksi cepat">
            <p>Isi</p>
          </SheetContent>
        </Sheet>
      );
      const { rerender } = render(sheet(true));
      rerender(sheet(false));

      const scrim = document.querySelector(".bg-scrim");
      expect(scrim).toHaveAttribute("data-state", "closed");
      expect(scrim).toHaveClass("data-[state=closed]:animate-sheet-overlay-out");
      endExitAnimation(scrim);
      expect(document.querySelector(".bg-scrim")).toBeNull();
    } finally {
      restore();
    }
  });

  it("has no accessibility violations", async () => {
    render(
      <Sheet open>
        <SheetContent title="Detail tagihan" description="Nadia Putri, X-A" side="right">
          <p>Rp350.000</p>
        </SheetContent>
      </Sheet>,
    );
    await expectNoAxeViolations(screen.getByRole("dialog"));
  });
});
