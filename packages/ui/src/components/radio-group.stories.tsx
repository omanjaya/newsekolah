import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { FileSpreadsheet, FileText, Monitor, Moon, Sun } from "lucide-react";

import { RadioGroup, RadioGroupItem } from "./radio-group.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function ListDemo() {
  return (
    <div className="flex w-80 max-w-full flex-col gap-2">
      <p id="emphasis-label" className="text-label text-fg">
        Baris nama sekolah
      </p>
      <RadioGroup aria-labelledby="emphasis-label" defaultValue="auto">
        <RadioGroupItem
          value="auto"
          label="Otomatis"
          description="Dipilih dari baris yang sama dengan nama sekolah"
        />
        <RadioGroupItem value="1" label="Baris 1: Yayasan Pendidikan Nusantara" />
        <RadioGroupItem value="2" label="Baris 2: SMA Contoh" />
        <RadioGroupItem value="3" label="Baris 3: Jl. Merdeka 12" disabled />
      </RadioGroup>
    </div>
  );
}

function HorizontalDemo() {
  return (
    <RadioGroup aria-label="Cakupan" defaultValue="class" orientation="horizontal">
      <RadioGroupItem value="class" label="Per kelas" />
      <RadioGroupItem value="grade" label="Per angkatan" />
    </RadioGroup>
  );
}

function CardDemo() {
  return (
    <div className="flex w-[34rem] max-w-full flex-col gap-6">
      <RadioGroup
        aria-label="Format berkas"
        variant="card"
        defaultValue="xlsx"
        className="sm:grid-cols-2"
      >
        <RadioGroupItem
          value="xlsx"
          label="Excel"
          description="Bisa diolah lagi, kolom angka tetap angka"
          icon={<FileSpreadsheet />}
        />
        <RadioGroupItem
          value="pdf"
          label="PDF"
          description="Siap cetak dengan kop surat sekolah"
          icon={<FileText />}
        />
      </RadioGroup>
      <RadioGroup aria-label="Tema" variant="card" defaultValue="system" className="sm:grid-cols-3">
        <RadioGroupItem value="system" label="Ikuti perangkat" icon={<Monitor />} />
        <RadioGroupItem value="light" label="Terang" icon={<Sun />} />
        <RadioGroupItem value="dark" label="Gelap" icon={<Moon />} />
      </RadioGroup>
    </div>
  );
}

/** A whole group locked (the term is closed): every label and the checked dot dim with it. */
function DisabledDemo() {
  return (
    <div className="flex w-[34rem] max-w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p id="scope-label" className="text-label text-fg">
          Cakupan rapor
        </p>
        <RadioGroup aria-labelledby="scope-label" defaultValue="class" disabled>
          <RadioGroupItem
            value="class"
            label="Per kelas"
            description="Satu berkas untuk tiap kelas"
          />
          <RadioGroupItem value="grade" label="Per angkatan" />
        </RadioGroup>
      </div>
      <RadioGroup
        aria-label="Format berkas"
        variant="card"
        defaultValue="pdf"
        className="sm:grid-cols-2"
        disabled
      >
        <RadioGroupItem value="xlsx" label="Excel" icon={<FileSpreadsheet />} />
        <RadioGroupItem value="pdf" label="PDF" icon={<FileText />} />
      </RadioGroup>
    </div>
  );
}

const meta: Meta<typeof RadioGroup> = {
  title: "Components/RadioGroup",
  component: RadioGroup,
};
export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const List: Story = { render: () => <ListDemo /> };
export const Horizontal: Story = { render: () => <HorizontalDemo /> };
export const Cards: Story = { render: () => <CardDemo /> };
export const DisabledGroup: Story = { render: () => <DisabledDemo /> };
export const DisabledGroupDark: Story = {
  globals: { theme: "dark" },
  render: () => <DisabledDemo />,
};
export const Dark: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div className="flex flex-col gap-8">
      <ListDemo />
      <CardDemo />
    </div>
  ),
};
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => (
    <div className="flex flex-col gap-8">
      <ListDemo />
      <CardDemo />
    </div>
  ),
};
