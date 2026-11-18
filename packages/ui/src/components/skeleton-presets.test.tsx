import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { SkeletonCards, SkeletonDetail, SkeletonForm, SkeletonList } from "./skeleton-presets.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("Skeleton presets", () => {
  it("each is one busy status with a spoken name from UiLabels", async () => {
    const { container } = render(
      <UiLabelsProvider labels={{ loading: "Loading" }}>
        <SkeletonList rows={3} />
        <SkeletonCards count={2} />
        <SkeletonForm fields={2} />
        <SkeletonDetail rows={2} />
      </UiLabelsProvider>,
    );
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(4);
    for (const region of regions) {
      expect(region).toHaveAttribute("aria-busy", "true");
      expect(region).toHaveTextContent("Loading");
    }
    await expectNoAxeViolations(container);
  });

  it("draws the requested number of shapes", () => {
    const { container } = render(
      <>
        <SkeletonList rows={4} />
        <SkeletonCards count={3} />
      </>,
    );
    const [list, cards] = screen.getAllByRole("status");
    expect(list?.querySelectorAll(":scope > div")).toHaveLength(4);
    expect(cards?.querySelectorAll(":scope > div")).toHaveLength(3);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10);
  });

  it("drops the list frame when it sits in a card already", () => {
    render(<SkeletonList framed={false} />);
    expect(screen.getByRole("status")).not.toHaveClass("rounded-lg");
  });
});
