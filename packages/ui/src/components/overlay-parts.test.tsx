import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent } from "./dialog.js";

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
