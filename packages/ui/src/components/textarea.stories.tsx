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
export const AutoResize: Story = {
  args: { placeholder: "Tumbuh mengikuti isi", autoResize: true, rows: 2, "aria-label": "Catatan" },
};
export const Dark: Story = {
  args: { placeholder: "Catatan tambahan", "aria-label": "Catatan" },
  globals: { theme: "dark" },
};
export const Phone: Story = {
  args: { placeholder: "Catatan tambahan", "aria-label": "Catatan", autoResize: true },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-[390px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
};
