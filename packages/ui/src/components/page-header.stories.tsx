import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Download, Plus, Printer, Trash2 } from "lucide-react";

import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { PageHeader } from "./page-header.js";
import { Select } from "./select.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

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
        divider
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

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Gallery />,
};
