import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogNotice } from "./dialog.js";
import { Sheet, SheetContent, SheetNotice } from "./sheet.js";

describe("Overlay header and body", () => {
  // The body scrolls, so it clipped whatever its first child drew past its
  // box: a tile's outside ring, a focused field's outline.
  it("insets the body 4px under a header and keeps the gap to it at 16px", () => {
    render(
      <Dialog open>
        <DialogContent title="Aksi cepat">
          <p>Isi</p>
        </DialogContent>
      </Dialog>,
    );
    const body = screen.getByText("Isi").parentElement;
    expect(body).toHaveClass("dialog-body", "pt-1");
    const header = screen.getByRole("heading", { name: "Aksi cepat" }).closest("[data-sheet-drag]");
    expect(header).toHaveClass("pb-3");
    expect(header).not.toHaveClass("pb-4");
  });
});

describe("DialogNotice", () => {
  // An action taken on a row far down a scrolled sheet reports back here;
  // in the normal flow the notice sat above the rows, scrolled out of view.
  it("pins a live region under the header while the sheet's body scrolls", () => {
    render(
      <Sheet open>
        <SheetContent title="Katalog">
          <SheetNotice>
            <p>Dinonaktifkan</p>
          </SheetNotice>
          <p>Baris</p>
        </SheetContent>
      </Sheet>,
    );
    const notice = screen.getByText("Dinonaktifkan").parentElement;
    expect(notice).toHaveAttribute("aria-live", "polite");
    expect(notice).toHaveClass("sticky", "top-0", "z-sticky", "bg-surface-overlay");
    // Sticky holds only within its parent: it must be the scroller's own child.
    expect(notice?.parentElement).toHaveClass("dialog-body", "overflow-y-auto");
  });

  it("takes no space while empty", () => {
    render(
      <Dialog open>
        <DialogContent title="Katalog">
          <DialogNotice data-testid="notice" />
          <p>Baris</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByTestId("notice")).toHaveClass("empty:hidden");
  });
});
