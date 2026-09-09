import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "./input.js";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { placeholder: "Nama pengguna" } };
export const Invalid: Story = { args: { placeholder: "Nama pengguna", invalid: true } };
export const Disabled: Story = { args: { placeholder: "Nama pengguna", disabled: true } };
