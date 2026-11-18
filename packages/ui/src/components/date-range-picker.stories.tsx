import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import type { DateRange } from "./calendar.js";
import { DateRangePicker, type DateRangePreset } from "./date-range-picker.js";

const TODAY = "2026-11-14";

const presets: DateRangePreset[] = [
  { label: "Hari ini", from: TODAY, to: TODAY },
  { label: "7 hari terakhir", from: "2026-11-08", to: TODAY },
  { label: "Bulan ini", from: "2026-11-01", to: TODAY },
  { label: "Bulan lalu", from: "2026-10-01", to: "2026-10-31" },
];

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Field({ initial, withPresets = true }: { initial?: DateRange; withPresets?: boolean }) {
  const [range, setRange] = useState<DateRange>(initial ?? { from: "", to: "" });
  return (
    <div className="flex w-72 max-w-full flex-col gap-1.5">
      <label htmlFor="story-range" className="text-sm font-medium text-fg">
        Periode laporan
      </label>
      <DateRangePicker
        id="story-range"
        value={range}
        onChange={setRange}
        presets={withPresets ? presets : undefined}
        today={TODAY}
        max={TODAY}
      />
      <p className="text-sm text-fg-muted">
        Nilai tersimpan: {range.from ? `${range.from} s.d. ${range.to}` : "kosong"}
      </p>
    </div>
  );
}

const meta: Meta<typeof DateRangePicker> = {
  title: "Components/DateRangePicker",
  component: DateRangePicker,
};
export default meta;
type Story = StoryObj<typeof DateRangePicker>;

export const Empty: Story = { render: () => <Field /> };
export const Filled: Story = {
  render: () => <Field initial={{ from: "2026-11-01", to: "2026-11-14" }} />,
};
export const WithoutPresets: Story = { render: () => <Field withPresets={false} /> };
export const Dark: Story = {
  globals: { theme: "dark" },
  render: () => <Field initial={{ from: "2026-10-20", to: "2026-11-14" }} />,
};
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Field initial={{ from: "2026-11-08", to: "2026-11-14" }} />,
};
