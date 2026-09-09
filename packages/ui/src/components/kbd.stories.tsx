import type { Meta, StoryObj } from "@storybook/react";

import { Kbd } from "./kbd.js";

const meta: Meta<typeof Kbd> = {
  title: "Components/Kbd",
  component: Kbd,
};
export default meta;
type Story = StoryObj<typeof Kbd>;

export const Single: Story = { args: { children: "K" } };
export const Combo: Story = {
  render: () => (
    <span className="flex items-center gap-1">
      <Kbd>Ctrl</Kbd>
      <Kbd>K</Kbd>
    </span>
  ),
};
