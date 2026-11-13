import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { DatePicker, type DatePickerProps } from "./date-picker.js";

const TODAY = "2026-11-14";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Field(props: Omit<DatePickerProps, "id" | "value" | "onChange"> & { initial?: string }) {
  const { initial = "", ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <div className="flex w-72 max-w-full flex-col gap-1.5">
      <label htmlFor="story-date" className="text-sm font-medium text-fg">
        Tanggal pengajuan
      </label>
      <DatePicker id="story-date" value={value} onChange={setValue} today={TODAY} {...rest} />
      <p className="text-sm text-fg-muted">Nilai tersimpan: {value || "kosong"}</p>
    </div>
  );
}

const meta: Meta<typeof DatePicker> = {
  title: "Components/DatePicker",
  component: DatePicker,
};
export default meta;
type Story = StoryObj<typeof DatePicker>;

export const Empty: Story = { render: () => <Field /> };
export const Filled: Story = { render: () => <Field initial="2026-11-14" /> };
export const Required: Story = { render: () => <Field initial="2026-11-14" required /> };
export const WithBounds: Story = {
  render: () => <Field initial="2026-11-14" min="2026-11-01" max={TODAY} />,
};
export const Invalid: Story = { render: () => <Field invalid /> };
export const Disabled: Story = { render: () => <Field initial="2026-11-14" disabled /> };
export const Dark: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div className="flex flex-col gap-4">
      <Field initial="2026-11-14" />
      <Field invalid />
    </div>
  ),
};
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Field initial="2026-11-14" />,
};
