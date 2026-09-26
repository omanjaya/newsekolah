import type { Meta, StoryObj } from "@storybook/react";
import { BookOpen, CalendarCheck, GraduationCap, ShieldAlert, Users } from "lucide-react";

import { StatTile } from "./stat-tile.js";

const meta: Meta<typeof StatTile> = {
  title: "Components/StatTile",
  component: StatTile,
};
export default meta;
type Story = StoryObj<typeof StatTile>;

export const Default: Story = {
  args: { icon: CalendarCheck, tone: "green", value: "96%", label: "Kehadiran", hint: "bulan ini" },
};

export const AllTones: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatTile icon={CalendarCheck} tone="green" value="96%" label="Kehadiran" hint="bulan ini" />
      <StatTile icon={Users} tone="amber" value="1" label="Izin menunggu" />
      <StatTile icon={GraduationCap} tone="purple" value="3" label="Nilai baru" />
      <StatTile icon={BookOpen} tone="blue" value="2 buku" label="Kembali Sabtu" />
      <StatTile icon={ShieldAlert} tone="red" value="1" label="Terlambat" />
    </div>
  ),
};
