import type { Decorator, Meta, StoryObj } from "@storybook/react";

import { Checkbox } from "./checkbox.js";

/** The bare box (for table rows) and the labelled row with a description, in every state. */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Gallery() {
  return (
    <div className="flex w-[28rem] max-w-full flex-col gap-6">
      <div className="flex items-center gap-6">
        <Checkbox aria-label="Belum dipilih" />
        <Checkbox aria-label="Dipilih" defaultChecked />
        <Checkbox aria-label="Sebagian" checked="indeterminate" />
        <Checkbox aria-label="Tidak valid" invalid />
        <Checkbox aria-label="Nonaktif" disabled />
        <Checkbox aria-label="Nonaktif dipilih" disabled defaultChecked />
      </div>
      <div className="flex flex-col">
        <Checkbox
          label="Kirim pemberitahuan ke orang tua"
          description="Lewat WhatsApp dan notifikasi aplikasi."
          defaultChecked
        />
        <Checkbox label="Tampilkan yang diarsipkan" />
        <Checkbox
          label="Saya sudah membaca tata tertib"
          description="Wajib dicentang sebelum mengirim."
          invalid
        />
        <Checkbox label="Sinkron otomatis" description="Diatur oleh admin." disabled />
      </div>
    </div>
  );
}

const meta: Meta<typeof Gallery> = {
  title: "Components/Checkbox",
  component: Gallery,
};
export default meta;
type Story = StoryObj<typeof Gallery>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = { parameters: { layout: "fullscreen" }, decorators: [phoneFrame] };
