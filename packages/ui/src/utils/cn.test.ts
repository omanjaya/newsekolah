import { describe, expect, it } from "vitest";

import { cn } from "./cn.js";

describe("cn", () => {
  describe("typography roles", () => {
    it("lets a later role replace an earlier one", () => {
      expect(cn("text-body", "text-caption")).toBe("text-caption");
      expect(cn("text-title-lg", "text-display")).toBe("text-display");
      expect(cn("text-body-sm", "text-label")).toBe("text-label");
    });

    it("keeps a role next to a text color", () => {
      expect(cn("text-caption", "text-fg-muted")).toBe("text-caption text-fg-muted");
      expect(cn("text-fg", "text-heading")).toBe("text-fg text-heading");
    });

    it("drops the size, leading, weight, tracking and family a role sets", () => {
      // The literal size is the point of this case: a role must replace it.
      // eslint-disable-next-line no-restricted-syntax -- fixture string, not a class in use
      const handWritten = "text-[13px] font-medium leading-tight tracking-tight font-heading";
      expect(cn(handWritten, "text-body")).toBe("text-body");
    });

    it("keeps an override that comes after the role", () => {
      expect(cn("text-caption", "font-semibold")).toBe("text-caption font-semibold");
      expect(cn("text-body", "leading-tight")).toBe("text-body leading-tight");
    });

    it("lets a plain size after a role replace it", () => {
      expect(cn("text-caption", "text-sm")).toBe("text-sm");
    });
  });

  it("merges elevation levels and their aliases", () => {
    expect(cn("shadow-card", "shadow-none")).toBe("shadow-none");
    expect(cn("shadow-1", "shadow-3")).toBe("shadow-3");
    expect(cn("shadow-float", "shadow-0")).toBe("shadow-0");
  });

  it("merges motion durations and easings", () => {
    expect(cn("duration-fast", "duration-slow")).toBe("duration-slow");
    expect(cn("duration-200", "duration-base")).toBe("duration-base");
    expect(cn("ease-standard", "ease-out")).toBe("ease-out");
    expect(cn("ease-in", "ease-enter")).toBe("ease-enter");
  });

  it("merges named z-index layers", () => {
    expect(cn("z-dropdown", "z-popover")).toBe("z-popover");
    expect(cn("z-10", "z-modal")).toBe("z-modal");
  });

  it("merges keyframe utilities", () => {
    expect(cn("animate-pulse", "animate-shimmer")).toBe("animate-shimmer");
    expect(cn("animate-dialog-in", "animate-none")).toBe("animate-none");
  });

  it("merges container widths and the xl radius", () => {
    expect(cn("max-w-md", "max-w-narrow")).toBe("max-w-narrow");
    expect(cn("rounded-lg", "rounded-xl")).toBe("rounded-xl");
  });

  it("keeps the new surface and state colors as ordinary colors", () => {
    expect(cn("bg-surface", "bg-surface-raised")).toBe("bg-surface-raised");
    expect(cn("hover:bg-bg", "hover:bg-state-hover")).toBe("hover:bg-state-hover");
    expect(cn("border-border", "border-border-strong")).toBe("border-border-strong");
  });
});
