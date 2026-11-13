import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";

import { Button } from "./button.js";
import { Toaster, toast, useToast } from "./toast.js";

/** Open at a 390px viewport to see toasts move to the top of the screen. */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

function ToastButtons() {
  const notify = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => {
          notify.success("Izin berhasil dikirim", {
            description: "Wali kelas akan meninjau hari ini",
          });
        }}
      >
        Sukses
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          notify.info("Presensi tersimpan di perangkat", {
            description: "Dikirim otomatis saat koneksi kembali",
          });
        }}
      >
        Info
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          notify.warning("Jadwal bentrok dengan Fisika");
        }}
      >
        Peringatan
      </Button>
      <Button
        variant="danger"
        onClick={() => {
          notify.error("Gagal menyimpan presensi", {
            description: "Periksa koneksi lalu coba lagi.",
            retry: { label: "Coba lagi", onClick: () => undefined },
          });
        }}
      >
        Gagal
      </Button>
    </div>
  );
}

/** Shows one toast of each kind as the story opens, for review and screenshots. */
function ToastShowcase() {
  useEffect(() => {
    toast.success("Izin berhasil dikirim", {
      description: "Wali kelas akan meninjau hari ini",
    });
    toast.error("Gagal menyimpan presensi", {
      description: "Periksa koneksi lalu coba lagi.",
      retry: { label: "Coba lagi", onClick: () => undefined },
    });
    toast.success("Buku dikembalikan", {
      action: { label: "Urungkan", onClick: () => undefined },
    });
    return () => {
      toast.dismiss();
    };
  }, []);
  return (
    <>
      <Toaster expand duration={600_000} />
      <ToastButtons />
    </>
  );
}

function SingleToast() {
  useEffect(() => {
    toast.success("Izin berhasil dikirim", {
      description: "Wali kelas akan meninjau hari ini",
    });
    return () => {
      toast.dismiss();
    };
  }, []);
  return (
    <>
      <Toaster duration={600_000} />
      <ToastButtons />
    </>
  );
}

const meta: Meta = {
  title: "Components/Toast",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-dvh">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj;

export const Kinds: Story = { render: () => <ToastShowcase /> };
export const Single: Story = { render: () => <SingleToast /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <ToastShowcase /> };
export const Phone: Story = { decorators: [phoneFrame], render: () => <SingleToast /> };
