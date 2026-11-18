import type { Meta, StoryObj } from "@storybook/react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Badge } from "./badge.js";
import { Card, CardHeader, CardTitle } from "./card.js";
import { DataList, DataListItem } from "./data-list.js";
import { SectionHeader } from "./section-header.js";
import { TextLink } from "./text-link.js";

const meta: Meta<typeof DataList> = {
  title: "Components/DataList",
  component: DataList,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DataList>;

function Gallery() {
  return (
    <div className="grid max-w-default gap-6 md:grid-cols-2">
      <Card>
        <CardHeader action={<TextLink href="#">Ubah</TextLink>}>
          <CardTitle>Data siswa</CardTitle>
        </CardHeader>
        <DataList>
          <DataListItem label="NIS">2026010042</DataListItem>
          <DataListItem label="Kelas">X-A</DataListItem>
          <DataListItem label="Wali kelas">Rina Wulandari, S.Pd.</DataListItem>
          <DataListItem label="Status">
            <Badge tone="success" dot>
              Aktif
            </Badge>
          </DataListItem>
          <DataListItem label="Telepon orang tua" />
        </DataList>
      </Card>
      <section className="flex flex-col gap-3">
        <SectionHeader title="Ringkasan izin" description="Diajukan 13 November 2026, 07.42" />
        <Card padding="md">
          <DataList layout="stacked">
            <DataListItem label="Jenis">Izin keluar</DataListItem>
            <DataListItem label="Durasi" hint="Kembali sebelum 11.00">
              2 jam
            </DataListItem>
            <DataListItem label="Penyetuju">Guru piket</DataListItem>
            <DataListItem label="Gerbang">Utara</DataListItem>
            <DataListItem label="Alasan" fullWidth>
              Kontrol gigi di puskesmas, didampingi orang tua.
            </DataListItem>
          </DataList>
        </Card>
      </section>
    </div>
  );
}

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => <Gallery />,
};
