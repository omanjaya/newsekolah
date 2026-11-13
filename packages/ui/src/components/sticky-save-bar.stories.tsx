import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";

import { Button } from "./button.js";
import { StickySaveBar, type StickySaveBarProps } from "./sticky-save-bar.js";

/**
 * A page with the shell's sidebar offset, so the bar's content can be
 * checked against the page gutter (16px on a phone, 24px from 768px).
 */
function Page(props: Partial<StickySaveBarProps>) {
  return (
    <div
      className="min-h-dvh"
      style={
        { "--shell-sidebar-width": "0px", "--shell-mobile-tab-offset": "0px" } as CSSProperties
      }
    >
      <div className="flex flex-col gap-3 px-4 pt-6 pb-32 md:px-6">
        <h1 className="text-display text-fg">Presensi X-A</h1>
        <p className="text-body text-fg-muted">
          Tepi kiri teks ini dan tepi kiri isi bilah simpan berada di garis yang sama.
        </p>
      </div>
      <StickySaveBar
        leadingSlot={
          <span className="text-body-sm text-fg-muted">12 perubahan belum tersimpan</span>
        }
        saveLabel="Simpan presensi"
        saving={false}
        onSave={() => undefined}
        {...props}
      />
    </div>
  );
}

const meta: Meta<typeof StickySaveBar> = {
  title: "Components/StickySaveBar",
  component: StickySaveBar,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof StickySaveBar>;

export const PendingChanges: Story = { render: () => <Page /> };
export const Saving: Story = { render: () => <Page saving /> };
export const Idle: Story = {
  render: () => (
    <Page
      disabled
      leadingSlot={<span className="text-body-sm text-fg-muted">Semua tersimpan.</span>}
    />
  ),
};
export const WithError: Story = {
  render: () => (
    <Page
      trailingSlot={
        <span role="alert" className="flex items-center gap-2 text-body-sm text-danger">
          Gagal menyimpan.
          <Button variant="link" size="sm">
            Coba lagi
          </Button>
        </span>
      }
    />
  ),
};
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Page /> };
