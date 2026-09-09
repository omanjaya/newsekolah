import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "./badge.js";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Neutral: Story = { args: { children: "Draf", variant: "neutral" } };
export const Accent: Story = { args: { children: "Baru", variant: "accent" } };
