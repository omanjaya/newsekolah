import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { Combobox } from "./combobox.js";
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
