import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { MonthPicker, type MonthPickerProps } from "./month-picker.js";

const TODAY = "2026-11-14";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Field(props: Omit<MonthPickerProps, "id" | "value" | "onChange"> & { initial?: string }) {
  const { initial = "", ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <div className="flex w-64 max-w-full flex-col gap-1.5">
      <label htmlFor="story-month" className="text-sm font-medium text-fg">
        Bulan tagihan
      </label>
      <MonthPicker id="story-month" value={value} onChange={setValue} today={TODAY} {...rest} />
    </div>
  );
}

const meta: Meta<typeof MonthPicker> = {
  title: "Components/MonthPicker",
  component: MonthPicker,
};
export default meta;
type Story = StoryObj<typeof MonthPicker>;

export const Empty: Story = { render: () => <Field /> };
export const Filled: Story = { render: () => <Field initial="2026-09" /> };
export const WithBounds: Story = {
  render: () => <Field initial="2026-09" min="2026-07" max="2026-12" />,
};
export const Dark: Story = {
  globals: { theme: "dark" },
  render: () => <Field initial="2026-11" />,
};
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Field initial="2026-11" />,
};
