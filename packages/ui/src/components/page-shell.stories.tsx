import type { Meta, StoryObj } from "@storybook/react";
import { Bell, BookOpen, Download, Plus, Upload, Users } from "lucide-react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Button } from "./button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card.js";
import { Input } from "./input.js";
import { NavTabs } from "./nav-tabs.js";
import { PageHeader } from "./page-header.js";
import { PageShell } from "./page-shell.js";
import { SearchInput } from "./search-input.js";
import { StatTile } from "./stat-tile.js";

const meta: Meta<typeof PageShell> = {
  title: "Components/PageShell",
  component: PageShell,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof PageShell>;

const TABS = [
  { href: "#accounts", label: "Pengguna sekolah", current: true },
  { href: "#roles", label: "Peran dan akses" },
];

function Rows({ count }: { count: number }) {
  return (
    <Card padding="none">
      <ul className="divide-y divide-line">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <span className="text-body text-fg">Pengguna {index + 1}</span>
            <span className="text-body-sm text-fg-muted">Guru</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A list page: eyebrow and title, the area's tabs right under it, filters, the list. */
export const Default: Story = {
  args: {
    header: (
      <PageHeader
        eyebrow="Data Sekolah"
        title="Pengguna dan akses"
        primaryAction={<Button icon={<Plus />}>Tambah pengguna</Button>}
        secondaryActions={[
          { label: "Impor pengguna", icon: <Upload />, onSelect: () => undefined },
        ]}
      />
    ),
    nav: <NavTabs aria-label="Bagian pengguna" variant="underline" items={TABS} />,
    toolbar: <SearchInput aria-label="Cari pengguna" placeholder="Cari" className="max-w-xs" />,
    children: <Rows count={6} />,
  },
};

/** A dashboard: wider column, tiles and cards. */
export const Wide: Story = {
  args: {
    variant: "wide",
    header: <PageHeader eyebrow="Beranda · Jumat, 14 November" title="Selamat datang, Admin" />,
    toolbar: (
      <>
        <Button variant="secondary" size="sm">
          Absen masuk / pulang
        </Button>
        <Button variant="secondary" size="sm">
          Buka monitor kehadiran
        </Button>
      </>
    ),
    children: (
      <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={Users} tone="green" value="812" label="Siswa aktif" />
          <StatTile icon={BookOpen} tone="amber" value="23" label="Buku dipinjam" />
          <StatTile icon={Bell} tone="purple" value="4" label="Notifikasi" />
          <StatTile icon={Download} tone="blue" value="2" label="Laporan baru" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pengumuman</CardTitle>
              <CardDescription>Tiga terbaru</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-24" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Perlu tindakan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-24" />
            </CardContent>
          </Card>
        </div>
      </>
    ),
  },
};

/** A form or settings page: 720px. */
export const Narrow: Story = {
  args: {
    variant: "narrow",
    breadcrumb: [{ label: "Pengaturan sekolah", href: "#settings" }, { label: "Identitas" }],
    header: <PageHeader title="Identitas sekolah" description="Nama, logo dan warna sekolah." />,
    children: (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Input aria-label="Nama sekolah" defaultValue="SMA Contoh" />
          <Input aria-label="Slogan" defaultValue="Belajar, berkarya, berbudi" />
          <div className="flex justify-end">
            <Button>Simpan</Button>
          </div>
        </CardContent>
      </Card>
    ),
  },
};

/** A table page: exactly as tall as the viewport, the list scrolls inside. */
export const Fit: Story = {
  args: {
    variant: "fit",
    header: <PageHeader eyebrow="Data Sekolah" title="Kelas dan siswa" />,
    children: (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-border bg-surface">
        <Rows count={30} />
      </div>
    ),
  },
};

export const Dark: Story = { ...Default, globals: { theme: "dark" } };

export const Phone: Story = {
  ...Default,
  decorators: [phoneViewport],
};
