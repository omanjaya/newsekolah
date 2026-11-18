import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Mail } from "lucide-react";

import { Input } from "./input.js";
import { PasswordInput } from "./password-input.js";
import { SearchInput } from "./search-input.js";
import { Textarea } from "./textarea.js";

/** The text fields: both sizes, adornments, password, search, textarea, and every state. */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Gallery() {
  return (
    <div className="grid w-[40rem] max-w-full gap-4 sm:grid-cols-2">
      <Input aria-label="Kosong" placeholder="Nama pengguna" />
      <Input aria-label="Terisi" defaultValue="guru01" />
      <Input aria-label="Kecil" size="sm" placeholder="Ukuran kecil" />
      <Input aria-label="Ikon" leading={<Mail aria-hidden="true" />} placeholder="Email" />
      <Input aria-label="Satuan" defaultValue="12,5" trailing="kg" inputMode="decimal" />
      <Input aria-label="Mata uang" leading="Rp" defaultValue="150.000" />
      <PasswordInput aria-label="Kata sandi" defaultValue="rahasia123" />
      <SearchInput aria-label="Cari" defaultValue="Nadia" />
      <Input aria-label="Tidak valid" invalid defaultValue="admin" />
      {/* A boxed field keeps its danger border while focused, as the plain one does. */}
      <Input aria-label="Nominal tidak valid" leading="Rp" invalid defaultValue="-5.000" />
      <Input aria-label="Nonaktif" disabled defaultValue="Terkunci" />
      <Textarea
        aria-label="Catatan"
        placeholder="Catatan untuk wali kelas"
        className="sm:col-span-2"
      />
      <Textarea
        aria-label="Tumbuh mengikuti isi"
        autoResize
        rows={2}
        defaultValue={"Baris pertama\nBaris kedua\nBaris ketiga"}
        className="sm:col-span-2"
      />
    </div>
  );
}

const meta: Meta<typeof Gallery> = {
  title: "Components/Input",
  component: Gallery,
};
export default meta;
type Story = StoryObj<typeof Gallery>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = { parameters: { layout: "fullscreen" }, decorators: [phoneFrame] };
