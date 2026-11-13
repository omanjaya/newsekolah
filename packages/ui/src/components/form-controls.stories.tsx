import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState, type ReactNode } from "react";

import type { DateRange } from "./calendar.js";
import { DatePicker } from "./date-picker.js";
import { DateRangePicker } from "./date-range-picker.js";
import { Input } from "./input.js";
import { MonthPicker } from "./month-picker.js";
import { NumberInput } from "./number-input.js";
import { Select } from "./select.js";
import { TimePicker } from "./time-picker.js";

/**
 * The new pickers next to the existing Input and Select, to check that a
 * form built from them lines up: same height, radius, border and text.
 */
const TODAY = "2026-11-14";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Row({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

function FormDemo() {
  const [date, setDate] = useState("2026-11-14");
  const [range, setRange] = useState<DateRange>({ from: "2026-11-01", to: TODAY });
  const [month, setMonth] = useState("2026-11");
  const [start, setStart] = useState("07:15");
  const [days, setDays] = useState<number | null>(7);
  const [score, setScore] = useState<number | null>(null);
  return (
    <form
      aria-label="Contoh formulir"
      className="grid w-[40rem] max-w-full gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 md:p-6"
    >
      <Row id="f-name" label="Nama siswa">
        <Input id="f-name" defaultValue="Nadia Putri" />
      </Row>
      <Row id="f-class" label="Kelas">
        <Select
          id="f-class"
          defaultValue="x-1"
          options={[
            { value: "x-1", label: "Kelas X-1" },
            { value: "x-2", label: "Kelas X-2" },
          ]}
        />
      </Row>
      <Row id="f-date" label="Tanggal izin">
        <DatePicker id="f-date" value={date} onChange={setDate} today={TODAY} required />
      </Row>
      <Row id="f-start" label="Jam keluar">
        <TimePicker id="f-start" value={start} onChange={setStart} minuteStep={5} />
      </Row>
      <Row id="f-range" label="Periode">
        <DateRangePicker id="f-range" value={range} onChange={setRange} today={TODAY} />
      </Row>
      <Row id="f-month" label="Bulan tagihan">
        <MonthPicker id="f-month" value={month} onChange={setMonth} today={TODAY} />
      </Row>
      <Row id="f-days" label="Lama izin">
        <NumberInput
          id="f-days"
          value={days}
          onChange={setDays}
          min={1}
          max={14}
          stepper
          suffix="hari"
        />
      </Row>
      <Row id="f-score" label="Nilai">
        <NumberInput
          id="f-score"
          value={score}
          onChange={setScore}
          min={0}
          max={100}
          step={0.5}
          placeholder="0 sampai 100"
        />
      </Row>
      <Row id="f-empty-date" label="Tanggal kembali (opsional)">
        <DatePicker id="f-empty-date" today={TODAY} />
      </Row>
      <Row id="f-invalid" label="Tanggal lahir">
        <DatePicker id="f-invalid" today={TODAY} invalid />
      </Row>
    </form>
  );
}

const meta: Meta<typeof FormDemo> = {
  title: "Components/Form controls",
  component: FormDemo,
};
export default meta;
type Story = StoryObj<typeof FormDemo>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = { parameters: { layout: "fullscreen" }, decorators: [phoneFrame] };
