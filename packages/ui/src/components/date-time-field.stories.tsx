import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { DateTimeField } from "./date-time-field.js";

const meta: Meta<typeof DateTimeField> = {
  title: "Components/DateTimeField",
  component: DateTimeField,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DateTimeField>;

function Demo({ initial, error }: { initial: string; error?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <DateTimeField
        value={value}
        onChange={setValue}
        dateLabel="Tanggal sesi"
        timeLabel="Jam sesi"
        today="2026-11-14"
        max="2026-11-14"
        required
        error={error}
      />
      <p className="text-caption text-fg-muted">Nilai: {value === "" ? "(kosong)" : value}</p>
    </div>
  );
}

function Gallery() {
  return (
    <div className="flex w-[28rem] max-w-full flex-col gap-8">
      <Demo initial="" />
      <Demo initial="2026-11-12T09:30" />
      <Demo initial="" error="Isi tanggal dan jam sesi." />
    </div>
  );
}

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => <Gallery />,
};
