import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    // The 4px inset is dialog-body's default --dialog-body-pt (styles.css).
    expect(body).toHaveClass("dialog-body");
    expect(body).not.toHaveAttribute("data-pad-top");
    const header = screen.getByRole("heading", { name: "Aksi cepat" }).closest("[data-sheet-drag]");
    expect(header).toHaveClass("pb-3");
    expect(header).not.toHaveClass("pb-4");
  });

  it("gives a body without a header the side padding as its top inset", () => {
    render(
      <Dialog open>
        <DialogContent title="Aksi cepat" hideHeader>
          <p>Isi</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Isi").parentElement).toHaveAttribute("data-pad-top");
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
    expect(notice).toHaveClass("sticky", "z-sticky", "bg-surface-overlay");
    // Sticky holds only within its parent: it must be the scroller's own child.
    expect(notice?.parentElement).toHaveClass("dialog-body", "overflow-y-auto");
  });

  // r4v-grades-discipline-R2: a sticky element stops at the scroller's
  // padding edge, so with `top: 0` the notice stuck 4px below the header
  // and the rows scrolling under it showed in that strip. It must stick as
  // far above the padding edge as the body's top inset, and bleed over the
  // inset by the same amount in the normal flow.
  it("sticks over the body's top inset, not below it", () => {
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
    expect(notice).toHaveClass(
      "-top-(--dialog-body-pt)",
      "-mt-(--dialog-body-pt)",
      "pt-(--dialog-body-pt)",
    );
    expect(notice).not.toHaveClass("top-0");
    // The variable it reads is the body's own top padding (styles.css).
    expect(notice?.parentElement).toHaveClass("dialog-body");
    expect(notice?.parentElement?.className).not.toMatch(/(^|\s)pt-/);
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

  describe("reserving its height as top scroll padding", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Browsers ignore sticky elements when they scroll a focused control
    // into view, so tabbing back up could leave a row action under it.
    it("publishes its height to the body, whose rule styles.css keys on a non-empty notice", () => {
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.hasAttribute("data-dialog-notice") ? 72 : 0;
      });
      const { unmount } = render(
        <Sheet open>
          <SheetContent title="Katalog">
            <SheetNotice>
              <p>Dinonaktifkan</p>
            </SheetNotice>
            <p>Baris</p>
          </SheetContent>
        </Sheet>,
      );
      const body = screen.getByText("Baris").parentElement;
      expect(body?.style.getPropertyValue("--dialog-notice-h")).toBe("72px");
      // The selector of the `dialog-body` rule that sets scroll-padding-top.
      expect(body?.matches(":has(> [data-dialog-notice]:not(:empty))")).toBe(true);
      unmount();
      expect(body?.style.getPropertyValue("--dialog-notice-h")).toBe("");
    });

    it("leaves the body's top scroll padding alone while empty", () => {
      render(
        <Dialog open>
          <DialogContent title="Katalog">
            <DialogNotice />
            <p>Baris</p>
          </DialogContent>
        </Dialog>,
      );
      const body = screen.getByText("Baris").parentElement;
      expect(body?.matches(":has(> [data-dialog-notice]:not(:empty))")).toBe(false);
    });
  });
});
