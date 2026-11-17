import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { Button } from "./button.js";
import { Combobox } from "./combobox.js";
import { Dialog, DialogClose, DialogContent } from "./dialog.js";
import { Field } from "./field.js";
import { Select } from "./select.js";

/** Select and Combobox side by side: one field, two ways to pick, in every state. */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const CLASSES = Array.from({ length: 24 }, (_, index) => {
  const grade = ["X", "XI", "XII"][Math.floor(index / 8)] ?? "X";
  return {
    value: `c${index}`,
    label: `Kelas ${grade} IPA ${(index % 8) + 1}`,
    description: index % 8 === 0 ? "Kelas unggulan" : undefined,
    disabled: index === 5,
  };
});

const TEACHERS = [
  { value: "rina", label: "Rina Kartika", description: "Matematika" },
  { value: "budi", label: "Budi Santoso", description: "Fisika" },
  { value: "dewi", label: "Dewi Lestari", description: "Bahasa Indonesia" },
];

function TeacherCombobox({ loading, empty }: { loading?: boolean; empty?: boolean }) {
  const [value, setValue] = useState(empty || loading ? "" : "rina");
  const [search, setSearch] = useState("");
  return (
    <Combobox
      aria-label="Guru"
      options={empty || loading ? [] : TEACHERS}
      value={value}
      onValueChange={setValue}
      search={search}
      onSearchChange={setSearch}
      loading={loading}
      placeholder="Pilih guru"
    />
  );
}

function Gallery() {
  return (
    <div className="grid w-[40rem] max-w-full gap-4 sm:grid-cols-2">
      <Select aria-label="Kelas" options={CLASSES} placeholder="Pilih kelas" />
      <Select aria-label="Kelas terpilih" options={CLASSES} defaultValue="c9" />
      <Select aria-label="Kecil" size="sm" options={CLASSES} defaultValue="c1" />
      <Select aria-label="Tidak valid" options={CLASSES} invalid />
      <Select aria-label="Nonaktif" options={CLASSES} defaultValue="c2" disabled />
      {/* An explicit "none" option shows its own label, not the placeholder. */}
      <Select
        aria-label="Golongan darah"
        defaultValue=""
        options={[
          { value: "", label: "Belum dipilih" },
          { value: "A", label: "A" },
          { value: "B", label: "B" },
          { value: "AB", label: "AB" },
          { value: "O", label: "O" },
        ]}
      />
      {/* A colour dot per option, shown in the closed field too. */}
      <Select
        aria-label="Jenis kegiatan"
        defaultValue="exam"
        options={[
          {
            value: "holiday",
            label: "Libur",
            icon: <span className="size-2.5 rounded-full bg-category-red" />,
          },
          {
            value: "exam",
            label: "Ujian",
            icon: <span className="size-2.5 rounded-full bg-category-blue" />,
          },
          {
            value: "event",
            label: "Kegiatan",
            icon: <span className="size-2.5 rounded-full bg-category-green" />,
          },
        ]}
      />
      <TeacherCombobox />
      <TeacherCombobox loading />
      <TeacherCombobox empty />
    </div>
  );
}

const meta: Meta<typeof Gallery> = {
  title: "Components/Select",
  component: Gallery,
};
export default meta;
type Story = StoryObj<typeof Gallery>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = { parameters: { layout: "fullscreen" }, decorators: [phoneFrame] };

/**
 * Closed fields inside an open dialog: every Radix overlay carries
 * data-state="open", and the chevrons must still point down until their
 * own list opens.
 */
function InDialogDemo() {
  const [teacher, setTeacher] = useState("");
  const [search, setSearch] = useState("");
  return (
    <Dialog defaultOpen>
      <DialogContent
        size="sm"
        title="Ubah kelas"
        description="Wali kelas dan ruang berlaku mulai semester ini."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Batal
              </Button>
            </DialogClose>
            <Button size="sm">Simpan</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Kelas" required>
            <Select options={CLASSES} defaultValue="c9" />
          </Field>
          <Field label="Wali kelas" hint="Dicari dari daftar guru aktif.">
            <Combobox
              options={TEACHERS}
              value={teacher}
              onValueChange={setTeacher}
              search={search}
              onSearchChange={setSearch}
              placeholder="Pilih guru"
            />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const InDialog: StoryObj<typeof InDialogDemo> = { render: () => <InDialogDemo /> };
export const InDialogDark: StoryObj<typeof InDialogDemo> = {
  render: () => <InDialogDemo />,
  globals: { theme: "dark" },
};
