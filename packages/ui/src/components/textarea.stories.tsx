import type { Meta, StoryObj } from "@storybook/react";

import { Textarea } from "./textarea.js";

const meta: Meta<typeof Textarea> = {
  title: "Components/Textarea",
  component: Textarea,
};
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { placeholder: "Catatan tambahan" } };
export const Invalid: Story = { args: { placeholder: "Catatan tambahan", invalid: true } };
