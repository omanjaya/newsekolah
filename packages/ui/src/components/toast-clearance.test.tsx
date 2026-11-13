import { render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button.js";
import { Dialog, DialogContent, DialogFooter } from "./dialog.js";
import { Sheet, SheetContent } from "./sheet.js";
import { TOAST_CLEARANCE_VAR } from "./toast-clearance.js";

function rect(box: { left: number; top: number; width: number; height: number }): DOMRect {
  const { left, top, width, height } = box;
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => box,
  };
}

/** Puts every action row at `box`; everything else keeps jsdom's empty box. */
function placeFooters(box: { left: number; top: number; width: number; height: number }) {
  const empty = rect({ left: 0, top: 0, width: 0, height: 0 });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return this.hasAttribute("data-overlay-footer") ? rect(box) : empty;
  });
}

const clearance = () => document.documentElement.style.getPropertyValue(TOAST_CLEARANCE_VAR);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toast clearance", () => {
  it("lifts toasts above an open drawer's action row in their corner, and drops it on close", () => {
    // jsdom's window is 1024 x 768; the row sits in the bottom-right corner.
    placeFooters({ left: 576, top: 690, width: 440, height: 70 });
    const { rerender } = render(
      <Sheet open>
        <SheetContent title="Rincian tagihan" side="right" footer={<Button>Simpan</Button>}>
          <p>Isi</p>
        </SheetContent>
      </Sheet>,
    );
    // 768 - 690 to the row's top edge, plus a 16px gap.
    expect(clearance()).toBe("94px");

    rerender(
      <Sheet open={false}>
        <SheetContent title="Rincian tagihan" side="right" footer={<Button>Simpan</Button>}>
          <p>Isi</p>
        </SheetContent>
      </Sheet>,
    );
    expect(clearance()).toBe("");
  });

  it("leaves toasts where they are when the action row is outside their column", () => {
    // A small dialog in the middle of the screen.
    placeFooters({ left: 312, top: 420, width: 400, height: 64 });
    render(
      <Dialog open>
        <DialogContent title="Hapus kelas?" footer={<Button>Hapus</Button>} />
      </Dialog>,
    );
    expect(clearance()).toBe("");
  });

  it("measures a DialogFooter inside a form too, and forwards its ref", () => {
    placeFooters({ left: 400, top: 700, width: 600, height: 60 });
    const footerRef = createRef<HTMLDivElement>();
    render(
      <Dialog open>
        <DialogContent title="Pengguna baru" size="xl">
          <form>
            <input aria-label="Nama" />
            <DialogFooter ref={footerRef}>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>,
    );
    expect(footerRef.current).toHaveAttribute("data-dialog-footer");
    expect(clearance()).toBe("84px");
  });
});
