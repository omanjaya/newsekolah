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
export const Filled: Story = { args: { defaultValue: "X IPA", "aria-label": "Cari kelas" } };
export const Small: Story = { args: { size: "sm", placeholder: "Cari", "aria-label": "Cari" } };
export const Dark: Story = {
  args: { defaultValue: "X IPA", "aria-label": "Cari kelas" },
  globals: { theme: "dark" },
};
export const Phone: Story = {
  args: { defaultValue: "X IPA", "aria-label": "Cari kelas" },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-[390px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
};
