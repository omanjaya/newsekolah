import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";
import { endExitAnimation, playExitAnimations } from "../test/exit-animation.js";

import { Button } from "./button.js";
import {
  EnsureTooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip.js";

function Late({ children }: { children?: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary">Terlambat</Button>
      </TooltipTrigger>
      <TooltipContent>{children ?? "Masuk 07.21, 6 menit setelah bel"}</TooltipContent>
    </Tooltip>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Tooltip", () => {
  it("opens on keyboard focus and closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Late />
      </TooltipProvider>,
    );
    await user.tab();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Masuk 07.21, 6 menit setelah bel");
    // The trigger is described by the tooltip, so its text is announced.
    expect(screen.getByRole("button", { name: "Terlambat" })).toHaveAccessibleDescription(
      "Masuk 07.21, 6 menit setelah bel",
    );

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("draws the theme's tooltip colors, fades out as it leaves and never takes the pointer", async () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <Button>Info</Button>
          </TooltipTrigger>
          <TooltipContent>Teks</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    // Radix renders the text twice (visible, and in a hidden live region);
    // the visible one is inside the styled content.
    const content = (await screen.findAllByText("Teks"))[0]?.closest(".bg-\\(--tooltip-bg\\)");
    expect(content).toHaveClass("pointer-events-none", "text-caption", "shadow-2", "z-tooltip");
    // Inverse in the light theme, the raised surface in the dark (styles.css).
    expect(content).toHaveClass("text-(--tooltip-fg)", "border-(--tooltip-border)");
    expect(content).toHaveClass("data-[state=closed]:animate-popover-out");
  });

  it("stays on screen for its exit animation instead of vanishing on leave", () => {
    const restore = playExitAnimations();
    try {
      const tooltip = (open: boolean) => (
        <TooltipProvider>
          <Tooltip open={open}>
            <TooltipTrigger asChild>
              <Button>Info</Button>
            </TooltipTrigger>
            <TooltipContent>Teks</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
      const { rerender } = render(tooltip(true));
      rerender(tooltip(false));
      const content = document.querySelector("[data-radix-popper-content-wrapper] > *");
      expect(content).toHaveAttribute("data-state", "closed");
      endExitAnimation(content);
      expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
    } finally {
      restore();
    }
  });

  describe("EnsureTooltipProvider", () => {
    /** Hovers the trigger and returns whether the tooltip is open `ms` later. */
    function openAfter(ms: number): boolean {
      vi.useFakeTimers();
      fireEvent.pointerMove(screen.getByRole("button", { name: "Terlambat" }), {
        pointerType: "mouse",
      });
      act(() => {
        vi.advanceTimersByTime(ms);
      });
      return screen.queryByRole("tooltip") !== null;
    }

    it("brings its own provider, with a 400ms delay, when none is above it", () => {
      render(
        <EnsureTooltipProvider>
          <Late />
        </EnsureTooltipProvider>,
      );
      expect(openAfter(50)).toBe(false);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("reuses an outer provider instead of nesting a second one", () => {
      // The outer provider opens at once; a nested one would wait 400ms.
      render(
        <TooltipProvider delayDuration={0}>
          <EnsureTooltipProvider>
            <Late />
          </EnsureTooltipProvider>
        </TooltipProvider>,
      );
      expect(openAfter(50)).toBe(true);
    });
  });

  it("has no accessibility violations when open", async () => {
    const { container } = render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <Button>Info</Button>
          </TooltipTrigger>
          <TooltipContent>Teks</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    // The trigger points at the tooltip by id; check both ends.
    await expectNoAxeViolations(container);
    await expectNoAxeViolations(await screen.findByRole("tooltip"));
  });
});
