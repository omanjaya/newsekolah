import type { Meta, StoryObj } from "@storybook/react";

import { StatusBadge } from "./status-badge.js";

const meta: Meta<typeof StatusBadge> = {
  title: "Components/StatusBadge",
  component: StatusBadge,
};
export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Present: Story = { args: { status: "present" } };
export const Sick: Story = { args: { status: "sick" } };
export const Excused: Story = { args: { status: "excused" } };
export const Dispensation: Story = { args: { status: "dispensation" } };
export const Absent: Story = { args: { status: "absent" } };
export const Late: Story = { args: { status: "late" } };
