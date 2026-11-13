import type { Meta, StoryObj } from "@storybook/react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Alert } from "./alert.js";
import { Button } from "./button.js";
import { TextLink } from "./text-link.js";

const meta: Meta<typeof Alert> = {
  title: "Components/Alert",
  component: Alert,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Alert>;

function Gallery() {
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <Alert title="Tahun ajaran 2026/2027 belum diaktifkan">
        Beberapa laporan akan kosong sampai tahun ajaran diaktifkan.
      </Alert>
      <Alert variant="success" title="Dokumen asli diterbitkan sekolah">
        Surat keterangan ini diterbitkan SMA Contoh pada 12 November 2026.
      </Alert>
      <Alert
        variant="warning"
        title="Sesi presensi ditutup dalam 5 menit"
        action={
          <Button size="sm" variant="secondary">
            Kirim sekarang
          </Button>
        }
      />
      <Alert
        variant="danger"
        title="Data gagal dimuat"
        action={
          <Button size="sm" variant="secondary">
            Coba lagi
          </Button>
        }
        onDismiss={() => undefined}
      >
        Periksa koneksi lalu coba lagi. Kode galat: NETWORK_TIMEOUT.
      </Alert>
      <Alert variant="info" onDismiss={() => undefined}>
        Hanya deskripsi, tanpa judul: dipakai untuk catatan singkat di atas formulir.
      </Alert>
      {/* A sentence with an inline link and emphasis stays one sentence. */}
      <Alert tone="warning" title="Judul ini sudah ada di katalog">
        Buku <strong>Laskar Pelangi</strong> dengan ISBN yang sama sudah tercatat.{" "}
        <TextLink variant="inline" href="#catalogue">
          Lihat judul
        </TextLink>
      </Alert>
      {/* Block children: text, then a row of buttons 8px under it. */}
      <Alert tone="warning" title="Draf ditemukan">
        <p>Ada jurnal yang belum terkirim dari pukul 08.40.</p>
        <div className="flex gap-2">
          <Button size="sm">Pulihkan</Button>
          <Button size="sm" variant="secondary">
            Buang
          </Button>
        </div>
      </Alert>
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
