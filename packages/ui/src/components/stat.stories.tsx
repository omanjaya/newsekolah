import type { Decorator, Meta, StoryObj } from "@storybook/react";
import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  ClockAlert,
  FileText,
  Star,
  UserCheck,
  Users,
} from "lucide-react";

import { Card, CardHeader, CardTitle } from "./card.js";
import { Stat, StatGrid } from "./stat.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

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
      <Stat icon={<CalendarCheck />} category="green" value="96%" label="Kehadiran" href="#a" />
      <Stat icon={<FileText />} category="amber" value={1} label="Izin menunggu" href="#b" />
      <Stat icon={<Star />} category="purple" value={3} label="Nilai baru" href="#c" />
      <Stat
        icon={<BookOpen />}
        category="blue"
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
    <StatGrid variant="strip">
      <Stat icon={<Users />} category="blue" value={36} label="Siswa" />
      <Stat icon={<ClipboardCheck />} category="green" value={28} label="Sudah dinilai" />
      <Stat icon={<ClockAlert />} category="amber" value={8} label="Belum dinilai" />
      <Stat icon={<Star />} category="purple" value="82,4" label="Rata-rata" />
      <Stat icon={<UserCheck />} category="green" value={30} label="Tuntas KKM" />
      <Stat icon={<ClockAlert />} category="red" value={6} label="Di bawah KKM" href="#remedial" />
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
        <Stat icon={<FileText />} category="amber" value={0} label="Izin menunggu" loading />
      </StatGrid>
      <StatGrid variant="strip">
        <Stat icon={<Users />} category="blue" value={0} label="Siswa" loading />
        <Stat icon={<ClipboardCheck />} value={0} label="Sudah dinilai" loading />
        <Stat icon={<ClockAlert />} category="amber" value={0} label="Belum dinilai" loading />
      </StatGrid>
    </div>
  );
}

function Gallery() {
  return (
    <div className="flex max-w-default flex-col gap-8">
      <Tiles />
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
  decorators: [phoneFrame],
  render: () => (
    <div className="flex flex-col gap-6 p-4">
      <StatGrid variant="tiles">
        <Stat icon={<CalendarCheck />} category="green" value="96%" label="Kehadiran" href="#a" />
        <Stat icon={<FileText />} category="amber" value={1} label="Izin menunggu" href="#b" />
        <Stat icon={<Star />} category="purple" value={3} label="Nilai baru" href="#c" />
        <Stat icon={<BookOpen />} category="blue" value="2 buku" label="Kembali Sabtu" href="#d" />
      </StatGrid>
      <Strip />
      <Plain />
    </div>
  ),
};
