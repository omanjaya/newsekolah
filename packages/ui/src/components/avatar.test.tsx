import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { AvatarGroup } from "./avatar-group.js";
import { Avatar } from "./avatar.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("Avatar", () => {
  it("is an image named after the person, showing two initials", async () => {
    const { container } = render(<Avatar name="Nadia Ayu Putri" />);
    const avatar = screen.getByRole("img", { name: "Nadia Ayu Putri" });
    expect(avatar).toHaveClass("size-8");
    expect(avatar).toHaveTextContent("NP");
    await expectNoAxeViolations(container);
  });

  it("maps the legacy names and pixel sizes, with one initial at 24px", () => {
    render(
      <>
        <Avatar name="Budi Santoso" size="sm" />
        <Avatar name="Rina Wulandari" size={64} />
      </>,
    );
    const small = screen.getByRole("img", { name: "Budi Santoso" });
    expect(small).toHaveClass("size-6");
    expect(small).toHaveTextContent(/^B$/);
    expect(screen.getByRole("img", { name: "Rina Wulandari" })).toHaveClass("size-16");
  });

  it("pins a tone and can be hidden when the name is written beside it", () => {
    const { container } = render(<Avatar name="Nadia" tone="accent" decorative />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getByText("N")).toHaveClass("bg-accent-soft");
  });
});

describe("AvatarGroup", () => {
  it("sizes its avatars and sums the rest in a named +N chip", async () => {
    const { container } = render(
      <UiLabelsProvider labels={{ avatarGroupMore: (count) => `${String(count)} more` }}>
        <AvatarGroup size={40} max={2} aria-label="Pengajar">
          <Avatar name="Agus Pratama" />
          <Avatar name="Made Ari" />
          <Avatar name="Sari Dewi" />
          <Avatar name="Rina Wulandari" />
        </AvatarGroup>
      </UiLabelsProvider>,
    );
    expect(screen.getByRole("group", { name: "Pengajar" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Agus Pratama" })).toHaveClass("size-10");
    expect(screen.queryByRole("img", { name: "Sari Dewi" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 more" })).toHaveTextContent("+2");
    await expectNoAxeViolations(container);
  });

  // The type role sets a weight of its own; written after it, the chip's
  // 600 survives tailwind-merge at every size.
  it("keeps the +N chip semibold next to the role at every size", () => {
    for (const size of [24, 32, 40, 64] as const) {
      const { unmount } = render(
        <AvatarGroup size={size} max={1}>
          <Avatar name="Agus Pratama" />
          <Avatar name="Made Ari" />
        </AvatarGroup>,
      );
      expect(screen.getByText("+1")).toHaveClass("font-semibold");
      unmount();
    }
  });
});
