import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Kbd } from "./kbd.js";

describe("Kbd", () => {
  it("is a keyboard key element with its label as text", () => {
    render(<Kbd>Esc</Kbd>);
    const key = screen.getByText("Esc");
    expect(key.tagName).toBe("KBD");
    // A 20px keycap on the caption role, never a fixed pixel size.
    expect(key).toHaveClass("h-5", "min-w-5", "text-caption");
    expect(key.className).not.toMatch(/text-\[\d+px\]/);
  });

  it("sizes an icon key to the caption text and keeps a caller's classes", () => {
    render(
      <Kbd className="ml-4" aria-label="Enter">
        <svg data-testid="icon" />
      </Kbd>,
    );
    const key = screen.getByLabelText("Enter");
    expect(key).toHaveClass("ml-4", "[&>svg]:size-3");
    expect(screen.getByTestId("icon").parentElement).toBe(key);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <p>
        Tekan <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> untuk mencari.
      </p>,
    );
    await expectNoAxeViolations(container);
  });
});
