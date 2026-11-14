import type { Meta, StoryObj } from "@storybook/react";
import { Download, Plus, Printer, Trash2 } from "lucide-react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { PageHeader } from "./page-header.js";
import { Select } from "./select.js";

const meta: Meta<typeof PageHeader> = {
  title: "Components/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

function Placeholder() {
  return <div className="h-24 rounded-lg border border-border bg-surface shadow-1" />;
}

function Gallery() {
  return (
    <div className="flex max-w-default flex-col gap-6">
      {/* What ~100 existing pages pass: eyebrow and title. */}
      <PageHeader eyebrow="Data Sekolah" title="Siswa & Kelas" />
      <Placeholder />
      <PageHeader
        eyebrow="Kesiswaan"
        title="Pelanggaran"
        description="Catatan pelanggaran siswa tahun ajaran ini, dengan poin dan tindak lanjutnya."
        primaryAction={<Button icon={<Plus />}>Catat pelanggaran</Button>}
        secondaryActions={[
          { label: "Unduh rekap", icon: <Download />, onSelect: () => undefined },
          { label: "Cetak", icon: <Printer />, onSelect: () => undefined },
        ]}
      />
      <Placeholder />
      <PageHeader
        breadcrumb={[
          { label: "Data Sekolah", href: "#" },
          { label: "Kelas", href: "#" },
          { label: "X-A" },
        ]}
        title="X-A · Wali kelas Bu Rina"
        actions={<Badge tone="success">Aktif</Badge>}
        secondaryActions={[
          {
            label: "Arsipkan kelas",
            icon: <Trash2 />,
            onSelect: () => undefined,
            destructive: true,
          },
        ]}
      />
      <Placeholder />
      <PageHeader
        eyebrow="Akademik"
        title="Nilai"
        actions={
          <Select
            aria-label="Kelas"
            className="w-40"
            value="xa"
            onValueChange={() => undefined}
            options={[
              { value: "xa", label: "X-A" },
              { value: "xb", label: "X-B" },
            ]}
          />
        }
      />
      <Placeholder />
    </div>
  );
}

const SCOPE_OPTIONS = [
  { value: "xa", label: "X-A" },
  { value: "xb", label: "X-B" },
];

/**
 * Wide actions in the content width a 768px tablet leaves beside the
 * expanded sidebar (480px), and in a wider column: when they do not fit
 * beside the title they wrap under it instead of squeezing it.
 */
function Crowded() {
  return (
    <div className="flex flex-col gap-8">
      {(
        [
          ["480px", "w-[480px]"],
          ["720px", "w-[720px]"],
        ] as const
      ).map(([width, widthClass]) => (
        <div key={width} data-width={width} className={`flex flex-col gap-6 ${widthClass}`}>
          <p className="text-caption text-fg-muted">{width}</p>
          <PageHeader
            eyebrow="Akademik"
            title="Penilaian"
            actions={
              <>
                <Select
                  aria-label="Kelas"
                  className="w-48 rounded-full"
                  value="xa"
                  onValueChange={() => undefined}
                  options={SCOPE_OPTIONS}
                />
                <Select
                  aria-label="Mata pelajaran"
                  className="w-48 rounded-full"
                  value="xa"
                  onValueChange={() => undefined}
                  options={SCOPE_OPTIONS}
                />
                <Select
                  aria-label="Semester"
                  className="w-40 rounded-full"
                  value="xa"
                  onValueChange={() => undefined}
                  options={SCOPE_OPTIONS}
                />
              </>
            }
          />
          <PageHeader
            eyebrow="Presensi"
            title="Jurnal Mengajar"
            description="Catatan setiap pertemuan, diisi guru setelah mengajar."
            actions={
              <>
                <Button size="sm" variant="secondary" icon={<Download />}>
                  Ekspor XLSX
                </Button>
                <Button size="sm" variant="secondary" icon={<Download />}>
                  Ekspor DOCX
                </Button>
                <Button size="sm" icon={<Plus />}>
                  Jurnal baru
                </Button>
              </>
            }
          />
          <PageHeader
            title="Rekapitulasi kehadiran siswa per kelas"
            primaryAction={<Button icon={<Plus />}>Catat</Button>}
          />
        </div>
      ))}
    </div>
  );
}

export const CrowdedActions: Story = { render: () => <Crowded /> };

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => <Gallery />,
};
