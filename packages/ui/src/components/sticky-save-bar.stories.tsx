import type { Meta, StoryObj } from "@storybook/react";
import { BookOpen, CalendarCheck, House, User } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "../utils/cn.js";

import { Button } from "./button.js";
import { StickySaveBar, type StickySaveBarProps } from "./sticky-save-bar.js";

/**
 * A page with the shell's sidebar offset, so the bar's content can be
 * checked against the page gutter (16px on a phone, 24px from 768px).
 * `-m-6` undoes the preview's own 24px padding, which the fixed bar does
 * not get, so the two left edges are compared on equal terms.
 */
function Page({ tabBar = false, ...props }: Partial<StickySaveBarProps> & { tabBar?: boolean }) {
  return (
    <div
      className="-m-6 min-h-dvh"
      style={
        {
          "--shell-sidebar-width": "0px",
          // The shell's phone tab bar is 64px tall; the bar sits on top of it.
          "--shell-mobile-tab-bar": tabBar ? "4rem" : "0px",
        } as CSSProperties
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
      {tabBar && <MockTabBar />}
    </div>
  );
}

/** A stand-in for the shell's phone tab bar, only below 768px like the real one. */
function MockTabBar() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 flex h-16 items-center justify-around border-t border-border bg-surface md:hidden"
    >
      {[
        { label: "Beranda", icon: <House /> },
        { label: "Presensi", icon: <CalendarCheck /> },
        { label: "Nilai", icon: <BookOpen /> },
        { label: "Akun", icon: <User /> },
      ].map((tab, index) => (
        <span
          key={tab.label}
          className={cn(
            "flex flex-col items-center gap-1 text-caption [&>svg]:size-5",
            index === 1 ? "text-accent" : "text-fg-muted",
          )}
        >
          {tab.icon}
          {tab.label}
        </span>
      ))}
    </nav>
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
/**
 * Open at a 390px viewport (the screenshot script does) to see the phone
 * layout: the hint above a full-width save button, the bar resting on the
 * shell's tab bar. From 768px it is the one-row bar of the other stories.
 */
export const Phone: Story = { render: () => <Page tabBar /> };
export const PhoneWithError: Story = {
  render: () => (
    <Page
      tabBar
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
