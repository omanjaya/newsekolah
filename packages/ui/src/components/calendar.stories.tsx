import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { weekdayIndex } from "../utils/iso-date.js";

import { Calendar, type DateRange } from "./calendar.js";

const TODAY = "2026-11-14";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

function SingleDemo() {
  const [value, setValue] = useState("2026-11-20");
  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-(--shadow-float)">
      <Calendar value={value} onChange={setValue} today={TODAY} />
    </div>
  );
}

function RangeDemo() {
  const [range, setRange] = useState<DateRange>({ from: "2026-11-09", to: "2026-11-18" });
  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-(--shadow-float)">
      <Calendar mode="range" value={range} onChange={setRange} today={TODAY} />
    </div>
  );
}

function isWeekend(date: string): boolean {
  return weekdayIndex(date) >= 5;
}

function BoundsDemo() {
  const [value, setValue] = useState("");
  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-(--shadow-float)">
      <Calendar
        value={value}
        onChange={setValue}
        today={TODAY}
        min="2026-11-03"
        max="2026-11-27"
        isDateDisabled={isWeekend}
      />
    </div>
  );
}

// Attendance-style markers; status tokens are for presence, which this is.
const STATUS: Record<string, { dot: string; label: string }> = {
  "2026-11-02": { dot: "bg-status-present", label: "Hadir" },
  "2026-11-03": { dot: "bg-status-present", label: "Hadir" },
  "2026-11-04": { dot: "bg-status-sick", label: "Sakit" },
  "2026-11-05": { dot: "bg-status-present", label: "Hadir" },
  "2026-11-06": { dot: "bg-status-excused", label: "Izin" },
  "2026-11-09": { dot: "bg-status-present", label: "Hadir" },
  "2026-11-10": { dot: "bg-status-absent", label: "Alfa" },
  "2026-11-11": { dot: "bg-status-present", label: "Hadir" },
  "2026-11-12": { dot: "bg-status-present", label: "Hadir" },
  "2026-11-13": { dot: "bg-status-present", label: "Hadir" },
};

function FluidDemo() {
  const [value, setValue] = useState(TODAY);
  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-4">
      <Calendar
        layout="fluid"
        value={value}
        onChange={setValue}
        today={TODAY}
        showOutsideDays={false}
        getDayDescription={(date) => STATUS[date]?.label}
        renderDay={(day) => {
          const status = STATUS[day.date];
          if (!status) return null;
          return (
            <>
              <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
              <span aria-hidden="true" className="hidden text-xs text-fg-muted md:block">
                {status.label}
              </span>
            </>
          );
        }}
      />
    </div>
  );
}

function MarkersDemo() {
  const [value, setValue] = useState("");
  const events = new Set(["2026-11-10", "2026-11-17", "2026-11-25"]);
  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-(--shadow-float)">
      <Calendar
        value={value}
        onChange={setValue}
        today={TODAY}
        getDayDescription={(date) => (events.has(date) ? "Ada agenda" : undefined)}
        renderDay={(day) =>
          events.has(day.date) ? <span className="size-1 rounded-full bg-info" /> : null
        }
      />
    </div>
  );
}

const meta: Meta<typeof Calendar> = {
  title: "Components/Calendar",
  component: Calendar,
};
export default meta;
type Story = StoryObj<typeof Calendar>;

export const Default: Story = { render: () => <SingleDemo /> };
export const Range: Story = { render: () => <RangeDemo /> };
export const BoundsAndWeekends: Story = { render: () => <BoundsDemo /> };
export const WithMarkers: Story = { render: () => <MarkersDemo /> };
export const FluidWithStatus: Story = {
  parameters: { layout: "padded" },
  render: () => <FluidDemo />,
};
export const Dark: Story = { globals: { theme: "dark" }, render: () => <RangeDemo /> };
export const DarkFluid: Story = {
  globals: { theme: "dark" },
  parameters: { layout: "padded" },
  render: () => <FluidDemo />,
};
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => (
    <div className="flex flex-col gap-4">
      <SingleDemo />
      <FluidDemo />
    </div>
  ),
};
