import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResponsivePopover } from "./responsive-popover.js";

function Harness() {
  return (
    <ResponsivePopover
      title="Status"
      className="w-56 p-1"
      trigger={
        <button type="button" aria-label="Status">
          Status
        </button>
      }
    >
      <p>Tersedia</p>
    </ResponsivePopover>
  );
}

/** A `matchMedia` that answers every query with `matches`. */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResponsivePopover", () => {
  it("opens an anchored popover named after its title from sm up", async () => {
    stubMatchMedia(false);
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Status" }));
    const panel = await screen.findByRole("dialog", { name: "Status" });
    expect(panel).toHaveClass("z-popover", "w-56");
    expect(panel).toHaveTextContent("Tersedia");
  });

  it("opens a titled bottom sheet on a phone, not a popover hanging off the trigger", async () => {
    stubMatchMedia(true);
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Status" }));
    const sheet = await screen.findByRole("dialog", { name: "Status" });
    expect(sheet).toHaveAttribute("data-side", "bottom");
    expect(sheet).not.toHaveClass("z-popover");
    expect(screen.getByRole("heading", { name: "Status" })).toBeInTheDocument();
    expect(sheet).toHaveTextContent("Tersedia");
  });
});
