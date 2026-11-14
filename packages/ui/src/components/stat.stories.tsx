import type { Meta, StoryObj } from "@storybook/react";
import {
  BookOpen,
  CalendarCheck,
  CircleCheck,
  ClipboardCheck,
  ClockAlert,
  Eye,
  FileText,
  Star,
  TriangleAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { useState } from "react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Card, CardHeader, CardTitle } from "./card.js";
import { Stat, StatGrid } from "./stat.js";

const meta: Meta<typeof Stat> = {
  title: "Components/Stat",
  component: Stat,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Stat>;

/** The artboard's four home tiles, as links. */
function Tiles() {
  return (
    <StatGrid variant="tiles" className="sm:grid-cols-4">
      <Stat icon={<CalendarCheck />} tone="green" value="96%" label="Kehadiran" href="#a" />
      <Stat icon={<FileText />} tone="amber" value={1} label="Izin menunggu" href="#b" />
      <Stat icon={<Star />} tone="purple" value={3} label="Nilai baru" href="#c" />
      <Stat
        icon={<BookOpen />}
        tone="blue"
        value="2 buku"
        label="Kembali Sabtu"
        hint="Perpanjang di meja sirkulasi"
      />
    </StatGrid>
  );
}

/** Seven figures in one low row: the work-screen summary that keeps the table on the first screen. */
function Strip() {
  return (
    <StatGrid variant="strip" aria-label="Ringkasan nilai X-A">
      <Stat icon={<Users />} tone="blue" value={36} label="Siswa" />
      <Stat icon={<ClipboardCheck />} tone="green" value={28} label="Sudah dinilai" />
      <Stat icon={<ClockAlert />} tone="amber" value={8} label="Belum dinilai" />
      <Stat icon={<Star />} tone="purple" value="82,4" label="Rata-rata" />
      <Stat icon={<UserCheck />} tone="green" value={30} label="Tuntas KKM" />
      <Stat icon={<ClockAlert />} tone="red" value={6} label="Di bawah KKM" href="#remedial" />
      <Stat value="91" label="Tertinggi" />
    </StatGrid>
  );
}

/** Plain stats in a card, with a change figure and a count-up. */
function Plain() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rekap kunjungan</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        <StatGrid className="sm:grid-cols-3">
          <Stat
            label="Total kunjungan"
            value={1284}
            countUp
            delta={{ value: "+12% dari bulan lalu", direction: "up" }}
          />
          <Stat
            label="Masih di sekolah"
            value={7}
            delta={{ value: "2 lebih sedikit", direction: "down", tone: "success" }}
          />
          <Stat label="Rata-rata lama" value="42 menit" hint="Senin sampai Jumat" />
        </StatGrid>
      </div>
    </Card>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <StatGrid variant="tiles">
        <Stat icon={<CalendarCheck />} value={0} label="Kehadiran" loading />
        <Stat icon={<FileText />} tone="amber" value={0} label="Izin menunggu" loading />
      </StatGrid>
      <StatGrid variant="strip" aria-label="Ringkasan nilai">
        <Stat icon={<Users />} tone="blue" value={0} label="Siswa" loading />
        <Stat icon={<ClipboardCheck />} value={0} label="Sudah dinilai" loading />
        <Stat icon={<ClockAlert />} tone="amber" value={0} label="Belum dinilai" loading />
      </StatGrid>
    </div>
  );
}

/** Tiles that filter the list under them: one at a time, tap again to clear. */
function FilterTiles() {
  const [level, setLevel] = useState<string>("risk");
  const tiles = [
    { key: "risk", label: "Berisiko", value: 4, tone: "red", icon: <TriangleAlert /> },
    { key: "watch", label: "Dipantau", value: 11, tone: "amber", icon: <Eye /> },
    { key: "none", label: "Aman", value: 187, tone: "green", icon: <CircleCheck /> },
  ] as const;
  return (
    <StatGrid variant="tiles" aria-label="Tingkat risiko" className="grid-cols-3">
      {tiles.map((tile) => (
        <Stat
          key={tile.key}
          icon={tile.icon}
          tone={tile.tone}
          value={tile.value}
          label={tile.label}
          hint={level === tile.key ? "Menyaring daftar" : undefined}
          selected={level === tile.key}
          onClick={() => {
            setLevel(level === tile.key ? "" : tile.key);
          }}
        />
      ))}
    </StatGrid>
  );
}

function Gallery() {
  return (
    <div className="flex max-w-default flex-col gap-8">
      <Tiles />
      <FilterTiles />
      <Strip />
      <Plain />
      <Loading />
    </div>
  );
}

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => (
    <div className="flex flex-col gap-6">
      <StatGrid variant="tiles">
        <Stat icon={<CalendarCheck />} tone="green" value="96%" label="Kehadiran" href="#a" />
        <Stat icon={<FileText />} tone="amber" value={1} label="Izin menunggu" href="#b" />
        <Stat icon={<Star />} tone="purple" value={3} label="Nilai baru" href="#c" />
        <Stat icon={<BookOpen />} tone="blue" value="2 buku" label="Kembali Sabtu" href="#d" />
      </StatGrid>
      <FilterTiles />
      <Strip />
      <Plain />
    </div>
  ),
};
