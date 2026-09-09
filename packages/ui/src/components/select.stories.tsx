import type { Meta, StoryObj } from "@storybook/react";

import { Select } from "./select.js";

const meta: Meta<typeof Select> = {
  title: "Components/Select",
  component: Select,
};
export default meta;
type Story = StoryObj<typeof Select>;

const options = [
  { value: "x-1", label: "Kelas X-1" },
  { value: "x-2", label: "Kelas X-2" },
  { value: "xi-1", label: "Kelas XI-1", disabled: true },
];

export const Default: Story = { args: { options, placeholder: "Pilih kelas" } };
export const Invalid: Story = { args: { options, placeholder: "Pilih kelas", invalid: true } };
