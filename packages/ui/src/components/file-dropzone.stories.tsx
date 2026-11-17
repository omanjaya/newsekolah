import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Field } from "./field.js";
import { FileDropzone } from "./file-dropzone.js";

const meta: Meta<typeof FileDropzone> = {
  title: "Components/FileDropzone",
  component: FileDropzone,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof FileDropzone>;

/** Picks or takes a dropped file and shows its name, as an import screen does. */
function ImportField({ loading = false }: { loading?: boolean }) {
  const [name, setName] = useState<string | null>(null);
  return (
    <Field label="Berkas pengguna" hint="Maksimal 5000 baris dalam satu berkas.">
      <FileDropzone
        accept=".xlsx"
        fileName={name}
        loading={loading}
        chooseLabel="Pilih berkas"
        replaceLabel="Ganti berkas"
        title="Tarik berkas templat ke sini, atau pilih dari perangkat."
        hint="Format XLSX, sesuai templat."
        rejectMessage="Berkas harus berformat XLSX."
        onFile={(file) => {
          setName(file.name);
        }}
      />
    </Field>
  );
}

function Gallery() {
  return (
    <div className="flex w-[36rem] max-w-full flex-col gap-8">
      <ImportField />
      <FileDropzone
        fileName="buku-perpustakaan-2026.xlsx"
        chooseLabel="Pilih berkas"
        replaceLabel="Pilih berkas lain"
        hint="Format XLSX, sesuai templat perpustakaan."
        onFile={() => undefined}
      />
      <FileDropzone
        chooseLabel="Pilih berkas"
        title="Pilih berkas templat yang sudah diisi."
        error="Berkas tidak dapat dibaca. Pastikan formatnya XLSX dan sesuai templat."
        onFile={() => undefined}
      />
      <Field label="Berkas penempatan kelas" disabled>
        <FileDropzone
          chooseLabel="Pilih berkas"
          title="Pilih tahun ajaran dulu."
          onFile={() => undefined}
        />
      </Field>
      <ImportField loading />
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
