import type { Meta, StoryObj } from "@storybook/react";
import { BookOpen, CalendarCheck, GraduationCap, Users } from "lucide-react";

import { Stat, StatGrid } from "./stat.js";

const meta: Meta<typeof StatGrid> = {
  title: "Components/Stat",
  component: StatGrid,
};
export default meta;
type Story = StoryObj<typeof StatGrid>;

export const Default: Story = {
  render: () => (
    <StatGrid>
      <Stat label="Siswa" value="1.248" />
      <Stat label="Guru" value="87" />
      <Stat label="Pegawai" value="24" />
      <Stat label="Orang tua" value="1.102" />
    </StatGrid>
  ),
};

export const WithHints: Story = {
  render: () => (
    <StatGrid className="sm:grid-cols-2">
      <Stat label="Peminjaman aktif" value="163" hint="12 jatuh tempo pekan ini" />
      <Stat label="Denda belum dibayar" value="Rp 420.000" hint="dari 9 anggota" />
    </StatGrid>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <StatGrid>
      <Stat label="Kehadiran" value="96%" icon={<CalendarCheck />} category="green" />
      <Stat label="Izin menunggu" value="1" icon={<Users />} category="amber" />
      <Stat label="Nilai baru" value="3" icon={<GraduationCap />} category="purple" />
      <Stat label="Kembali Sabtu" value="2 buku" icon={<BookOpen />} category="blue" />
    </StatGrid>
  ),
};
