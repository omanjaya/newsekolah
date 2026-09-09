import type { Meta, StoryObj } from "@storybook/react";

import { Avatar } from "./avatar.js";

const meta: Meta<typeof Avatar> = {
  title: "Components/Avatar",
  component: Avatar,
};
export default meta;
type Story = StoryObj<typeof Avatar>;

export const Initials: Story = { args: { name: "Siti Aminah" } };
export const Small: Story = { args: { name: "Budi Santoso", size: "sm" } };
export const WithImage: Story = {
  args: { name: "Siti Aminah", src: "https://placehold.co/64x64" },
};
