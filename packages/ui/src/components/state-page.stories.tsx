import type { Meta, StoryObj } from "@storybook/react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Button } from "./button.js";
import { StatePage } from "./state-page.js";
import { TextLink } from "./text-link.js";

const meta: Meta<typeof StatePage> = {
  title: "Components/StatePage",
  component: StatePage,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof StatePage>;

// One rule on every state page: the first action is primary, even alone;
// a second one is secondary or a link.
const home = (
  <Button asChild>
    <a href="#home">Kembali ke beranda</a>
  </Button>
);
const homeSecondary = (
  <Button asChild variant="secondary">
    <a href="#home">Kembali ke beranda</a>
  </Button>
);

export const NotFound: Story = {
  args: {
    kind: "not-found",
    title: "Halaman tidak ditemukan",
    description: "Alamat yang dituju tidak ada atau sudah dipindahkan.",
    action: home,
    code: "404",
  },
};

export const Error: Story = {
  args: {
    kind: "error",
    title: "Terjadi kesalahan",
    description: "Halaman ini gagal dimuat. Coba lagi; bila berulang, hubungi admin sekolah.",
    action: <Button>Coba lagi</Button>,
    secondaryAction: homeSecondary,
    code: "a1b2c3d4",
  },
};

export const Forbidden: Story = {
  args: {
    kind: "forbidden",
    title: "Anda tidak punya akses",
    description:
      "Halaman ini hanya untuk peran tertentu. Minta admin sekolah bila Anda memerlukannya.",
    action: home,
  },
};

export const ModuleUnavailable: Story = {
  args: {
    kind: "module-unavailable",
    title: "Modul ini tidak aktif",
    description: "Sekolah Anda belum mengaktifkan modul Perpustakaan.",
    action: home,
    secondaryAction: <TextLink href="#">Pelajari modul</TextLink>,
  },
};

export const Offline: Story = {
  args: {
    kind: "offline",
    title: "Tidak ada koneksi",
    description: "Periksa jaringan Anda. Halaman akan dimuat ulang saat koneksi kembali.",
    action: <Button>Muat ulang</Button>,
    fullScreen: true,
  },
};

export const Dark: Story = { ...Error, globals: { theme: "dark" } };
export const Phone: Story = {
  ...NotFound,
  decorators: [phoneViewport],
};
