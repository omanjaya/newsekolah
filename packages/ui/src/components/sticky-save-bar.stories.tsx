import type { Meta, StoryObj } from "@storybook/react";

import { StickySaveBar } from "./sticky-save-bar.js";

const meta: Meta<typeof StickySaveBar> = {
  title: "Components/StickySaveBar",
  component: StickySaveBar,
};
export default meta;
type Story = StoryObj<typeof StickySaveBar>;

export const Idle: Story = {
  args: {
    leadingSlot: <span className="text-[13px] text-fg-muted">Semua tersimpan.</span>,
    saveLabel: "Simpan",
    saving: false,
    disabled: true,
    onSave: () => undefined,
  },
};

export const PendingChanges: Story = {
  args: {
    leadingSlot: <span className="text-[13px] text-fg-muted">12 perubahan belum tersimpan</span>,
    saveLabel: "Simpan semua",
    saving: false,
    onSave: () => undefined,
  },
};

export const WithError: Story = {
  args: {
    leadingSlot: <span className="text-[13px] text-fg-muted">12 perubahan belum tersimpan</span>,
    trailingSlot: (
      <span role="alert" className="flex items-center gap-2 text-[13px] text-status-absent">
        Gagal menyimpan.
        <button type="button" className="font-medium underline">
          Coba lagi
        </button>
      </span>
    ),
    saveLabel: "Simpan semua",
    saving: false,
    onSave: () => undefined,
  },
};
