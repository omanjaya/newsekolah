import type { Meta, StoryObj } from "@storybook/react";

import { SearchInput } from "./search-input.js";

const meta: Meta<typeof SearchInput> = {
  title: "Components/SearchInput",
  component: SearchInput,
};
export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Default: Story = { args: { placeholder: "Cari kelas" } };
export const Disabled: Story = { args: { placeholder: "Cari kelas", disabled: true } };
