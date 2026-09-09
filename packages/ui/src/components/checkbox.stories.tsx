import type { Meta, StoryObj } from "@storybook/react";

import { Checkbox } from "./checkbox.js";

const meta: Meta<typeof Checkbox> = {
  title: "Components/Checkbox",
  component: Checkbox,
};
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = { args: { "aria-label": "Pilih baris" } };
export const Checked: Story = { args: { "aria-label": "Pilih baris", defaultChecked: true } };
export const Disabled: Story = { args: { "aria-label": "Pilih baris", disabled: true } };
