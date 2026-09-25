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
export const Success: Story = { args: { children: "Lunas", variant: "success" } };
export const Warning: Story = { args: { children: "Menunggu", variant: "warning" } };
export const Danger: Story = { args: { children: "Ditolak", variant: "danger" } };
export const Info: Story = { args: { children: "Info", variant: "info" } };
