import type { Meta, StoryObj } from "@storybook/react";
import { BookOpen, CalendarCheck, GraduationCap, ShieldAlert, Users } from "lucide-react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { StatTile } from "./stat-tile.js";

/** The legacy name for `Stat appearance="tile"`; same component underneath. */
const meta: Meta<typeof StatTile> = {
  title: "Components/StatTile",
  component: StatTile,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof StatTile>;

export const Default: Story = {
  args: { icon: CalendarCheck, tone: "green", value: "96%", label: "Kehadiran", hint: "bulan ini" },
};

function AllTonesGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatTile icon={CalendarCheck} tone="green" value="96%" label="Kehadiran" hint="bulan ini" />
      <StatTile icon={Users} tone="amber" value={1} label="Izin menunggu" href="#izin" />
      <StatTile icon={GraduationCap} tone="purple" value={3} label="Nilai baru" countUp />
      <StatTile icon={BookOpen} tone="blue" value="2 buku" label="Kembali Sabtu" />
      <StatTile
        icon={ShieldAlert}
        tone="red"
        value={1}
        label="Terlambat"
        delta={{ value: "1 dari kemarin", direction: "up", tone: "danger" }}
      />
    </div>
  );
}

export const AllTones: Story = { render: () => <AllTonesGrid /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <AllTonesGrid /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => <AllTonesGrid />,
};
