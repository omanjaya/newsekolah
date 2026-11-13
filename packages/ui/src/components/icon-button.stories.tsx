import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Bell, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { IconButton, type IconButtonProps } from "./icon-button.js";
import { TooltipProvider } from "./tooltip.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const VARIANTS: NonNullable<IconButtonProps["variant"]>[] = ["ghost", "surface", "accent"];
const SIZES: NonNullable<IconButtonProps["size"]>[] = ["sm", "md", "lg"];

function Matrix() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-6">
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex items-center gap-6">
            <span className="w-16 text-caption text-fg-muted">{variant}</span>
            {SIZES.map((size) => (
              <div key={size} className="flex items-center gap-2">
                <IconButton variant={variant} size={size} icon={<Bell />} aria-label="Notifikasi" />
                <IconButton variant={variant} size={size} icon={<Search />} aria-label="Cari" />
              </div>
            ))}
            <IconButton variant={variant} icon={<Plus />} aria-label="Tambah" loading />
            <IconButton variant={variant} icon={<Trash2 />} aria-label="Hapus" disabled />
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="w-16 text-caption text-fg-muted">baris</span>
          <IconButton size="sm" icon={<Pencil />} aria-label="Ubah Nadia Putri" />
          <IconButton
            size="sm"
            icon={<MoreHorizontal />}
            aria-label="Aksi lain untuk Nadia Putri"
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

/** The artboard's header: two 44px round controls on the page background. */
function Header() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-bg p-5">
      <div className="flex flex-col gap-1">
        <span className="text-body-sm text-fg-muted">SMA Contoh, Kamis 25 Sep</span>
        <span className="text-display text-fg">Halo, Nadia</span>
      </div>
      <div className="flex items-center gap-2.5">
        <IconButton variant="surface" size="lg" icon={<Search />} aria-label="Cari" />
        <IconButton variant="surface" size="lg" icon={<Bell />} aria-label="Notifikasi" />
      </div>
    </div>
  );
}

const meta: Meta<typeof IconButton> = {
  title: "Components/IconButton",
  component: IconButton,
};
export default meta;
type Story = StoryObj<typeof IconButton>;

export const Variants: Story = { render: () => <Matrix /> };
export const ArtboardHeader: Story = { render: () => <Header /> };
export const TooltipShown: Story = {
  render: () => (
    <TooltipProvider delayDuration={0}>
      <div className="p-12">
        <IconButton variant="surface" icon={<Bell />} aria-label="Notifikasi" autoFocus />
      </div>
    </TooltipProvider>
  ),
};
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Matrix /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Header />,
};
