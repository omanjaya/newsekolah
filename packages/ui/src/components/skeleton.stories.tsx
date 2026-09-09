import type { Meta, StoryObj } from "@storybook/react";

import { Skeleton } from "./skeleton.js";

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  component: Skeleton,
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Line: Story = { args: { className: "h-4 w-48" } };
export const Block: Story = { args: { className: "h-24 w-64" } };
