import type { Decorator, Meta, StoryObj } from "@storybook/react";

import { TextLink } from "./text-link.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const meta: Meta<typeof TextLink> = {
  title: "Components/TextLink",
  component: TextLink,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof TextLink>;

function Gallery() {
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-6">
        <TextLink href="#">Lihat semua</TextLink>
        <TextLink href="#" tone="muted">
          Riwayat
        </TextLink>
        <TextLink href="https://example.org" external>
          Panduan resmi
        </TextLink>
      </div>
      <p className="text-body text-fg">
        Data kelas diambil dari{" "}
        <TextLink href="#" variant="inline">
          struktur sekolah
        </TextLink>
        . Perubahan wali kelas berlaku mulai semester berikutnya.
      </p>
      <p className="text-body-sm text-fg-muted">
        Butuh bantuan? Baca{" "}
        <TextLink href="#" variant="inline" tone="muted">
          pertanyaan umum
        </TextLink>
        .
      </p>
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
