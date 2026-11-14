import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { CalendarCheck, Clock, FileText, ShieldAlert, Users } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger, type TabsListProps } from "./tabs.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const HOMEROOM = [
  { value: "overview", label: "Ringkasan" },
  { value: "attendance", label: "Presensi kelas", count: 3 },
  { value: "permits", label: "Izin", count: 12 },
  // A count of 0 shows no chip (pass showZero to keep it).
  { value: "discipline", label: "Kedisiplinan", count: 0 },
  { value: "parents", label: "Orang tua" },
];

function Strip(props: Omit<TabsListProps, "children"> & { withCounts?: boolean }) {
  const { withCounts = true, ...listProps } = props;
  return (
    <Tabs defaultValue="attendance">
      <TabsList aria-label="Bagian kelas binaan" {...listProps}>
        {HOMEROOM.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} count={withCounts ? tab.count : undefined}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {HOMEROOM.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <p className="text-body text-fg-muted">Isi tab {tab.label}.</p>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function Gallery() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-heading text-fg">Pill (bawaan), md dan sm</h3>
        <Strip />
        <Strip size="sm" withCounts={false} />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-heading text-fg">Underline, md dan sm</h3>
        <Strip variant="underline" />
        <Strip variant="underline" size="sm" withCounts={false} />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-heading text-fg">Ikon, nonaktif, lebar penuh</h3>
        <Tabs defaultValue="today">
          <TabsList aria-label="Presensi pegawai" fullWidth>
            <TabsTrigger value="today" icon={<CalendarCheck />}>
              Hari ini
            </TabsTrigger>
            <TabsTrigger value="schedule" icon={<Clock />}>
              Jadwal kerja
            </TabsTrigger>
            <TabsTrigger value="recap" icon={<FileText />} disabled>
              Rekap
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs defaultValue="students">
          <TabsList aria-label="Profil" variant="underline">
            <TabsTrigger value="students" icon={<Users />}>
              Siswa
            </TabsTrigger>
            <TabsTrigger value="violations" icon={<ShieldAlert />} count={2}>
              Pelanggaran
            </TabsTrigger>
            <TabsTrigger value="docs" icon={<FileText />}>
              Dokumen
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </section>
    </div>
  );
}

/** Seven tabs in a narrow column: the strip scrolls with fades, the page never widens. */
function Overflowing() {
  const reports = ["Ringkasan", "Sirkulasi", "Kunjungan", "Koleksi", "Anggota", "Denda", "Opname"];
  return (
    <div className="flex w-80 max-w-full flex-col gap-6">
      <Tabs defaultValue="Kunjungan">
        <TabsList aria-label="Laporan perpustakaan">
          {reports.map((name) => (
            <TabsTrigger key={name} value={name}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Tabs defaultValue="Anggota">
        <TabsList aria-label="Laporan perpustakaan" variant="underline">
          {reports.map((name) => (
            <TabsTrigger key={name} value={name}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

const meta: Meta<typeof Tabs> = {
  title: "Components/Tabs",
  component: Tabs,
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Variants: Story = { render: () => <Gallery /> };
export const Overflow: Story = { render: () => <Overflowing /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Gallery />,
};
