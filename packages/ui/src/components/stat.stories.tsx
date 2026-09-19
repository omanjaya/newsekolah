import type { Meta, StoryObj } from "@storybook/react";

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
