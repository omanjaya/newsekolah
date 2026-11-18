import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { NumberInput, type NumberInputProps } from "./number-input.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Field({
  label,
  initial = null,
  ...props
}: Omit<NumberInputProps, "value" | "onChange"> & { label: string; initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  const id = `story-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="flex w-56 max-w-full flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <NumberInput id={id} value={value} onChange={setValue} {...props} />
      <p className="text-sm text-fg-muted">Nilai: {value === null ? "kosong" : String(value)}</p>
    </div>
  );
}

function Gallery() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Field label="Nilai harian" initial={85.5} min={0} max={100} step={0.5} />
      <Field label="Lama pinjam" initial={7} min={1} max={30} stepper suffix="hari" />
      <Field label="Denda per hari" initial={1500} min={0} step={500} prefix="Rp" useGrouping />
      <Field label="Bobot komponen" initial={40} min={0} max={100} suffix="%" />
      <Field label="Jumlah eksemplar" initial={null} min={1} max={200} stepper placeholder="0" />
      <Field label="Tahun terbit" initial={2024} min={1000} max={3000} invalid />
    </div>
  );
}

const meta: Meta<typeof NumberInput> = {
  title: "Components/NumberInput",
  component: NumberInput,
};
export default meta;
type Story = StoryObj<typeof NumberInput>;

export const Default: Story = { render: () => <Field label="Nilai" min={0} max={100} /> };
export const Variants: Story = { render: () => <Gallery /> };
export const Disabled: Story = {
  render: () => <Field label="Kuota" initial={30} stepper disabled />,
};
export const English: Story = {
  render: () => <Field label="Score" initial={85.5} step={0.1} locale="en-US" />,
};
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Gallery />,
};
