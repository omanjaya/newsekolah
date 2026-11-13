import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { TimePicker, type TimePickerProps } from "./time-picker.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Field(props: Omit<TimePickerProps, "id" | "value" | "onChange"> & { initial?: string }) {
  const { initial = "", ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <div className="flex w-48 max-w-full flex-col gap-1.5">
      <label htmlFor="story-time" className="text-sm font-medium text-fg">
        Jam mulai
      </label>
      <TimePicker id="story-time" value={value} onChange={setValue} {...rest} />
      <p className="text-sm text-fg-muted">Nilai tersimpan: {value || "kosong"}</p>
    </div>
  );
}

const meta: Meta<typeof TimePicker> = {
  title: "Components/TimePicker",
  component: TimePicker,
};
export default meta;
type Story = StoryObj<typeof TimePicker>;

export const Empty: Story = { render: () => <Field /> };
export const Filled: Story = { render: () => <Field initial="07:15" /> };
export const SchoolHours: Story = {
  render: () => <Field initial="07:30" min="06:30" max="16:00" minuteStep={5} />,
};
export const Invalid: Story = { render: () => <Field invalid /> };
export const Disabled: Story = { render: () => <Field initial="07:15" disabled /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Field initial="13:45" /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Field initial="07:15" />,
};
