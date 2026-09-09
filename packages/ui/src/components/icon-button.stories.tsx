import type { Meta, StoryObj } from "@storybook/react";
import { Pencil, Trash2 } from "lucide-react";

import { IconButton } from "./icon-button.js";

const meta: Meta<typeof IconButton> = {
  title: "Components/IconButton",
  component: IconButton,
};
export default meta;
type Story = StoryObj<typeof IconButton>;

export const Default: Story = { args: { icon: <Pencil />, "aria-label": "Ubah" } };
export const Outline: Story = {
  args: { icon: <Trash2 />, "aria-label": "Hapus", variant: "outline" },
};
export const Disabled: Story = { args: { icon: <Pencil />, "aria-label": "Ubah", disabled: true } };
