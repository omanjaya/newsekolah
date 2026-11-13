import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Download, Plus, ScanLine } from "lucide-react";

import { Button, type ButtonProps } from "./button.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const VARIANTS: NonNullable<ButtonProps["variant"]>[] = [
  "primary",
  "secondary",
  "ghost",
  "danger",
  "link",
];
const SIZES: NonNullable<ButtonProps["size"]>[] = ["sm", "md", "lg"];
const LABEL: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "Simpan",
  secondary: "Batal",
  ghost: "Lewati",
  danger: "Hapus",
  link: "Lihat semua",
};

function Matrix() {
  return (
    <div className="flex flex-col gap-6">
      {SIZES.map((size) => (
        <section key={size} className="flex flex-col gap-3">
          <h3 className="text-caption text-fg-muted">Ukuran {size}</h3>
          <div className="flex flex-wrap items-center gap-3">
            {VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} size={size}>
                {LABEL[variant]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size={size} icon={<Plus />}>
              Tambah siswa
            </Button>
            <Button size={size} variant="secondary" icon={<Download />}>
              Unduh
            </Button>
            <Button size={size} loading>
              Menyimpan
            </Button>
            <Button size={size} variant="secondary" disabled>
              Nonaktif
            </Button>
          </div>
        </section>
      ))}
      <section className="flex flex-col gap-3">
        <h3 className="text-caption text-fg-muted">Aksi utama di HP</h3>
        <Button size="lg" icon={<ScanLine />} className="w-full max-w-sm">
          Pindai dengan kamera
        </Button>
      </section>
    </div>
  );
}

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  args: { children: "Simpan presensi" },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Variants: Story = { render: () => <Matrix /> };
export const Primary: Story = {};
export const Link: Story = { args: { variant: "link", children: "Lihat semua" } };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Matrix /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Matrix />,
};
