import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { NavTabs, type NavTabsItem } from "./nav-tabs.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const STAFF = [
  { href: "#today", label: "Hari ini" },
  { href: "#schedule", label: "Jadwal kerja" },
  { href: "#corrections", label: "Koreksi", count: 4 },
  { href: "#recap", label: "Rekap bulanan" },
];

const GUESTBOOK = [
  { href: "#guests-today", label: "Hari ini" },
  { href: "#expected", label: "Tamu terjadwal" },
  { href: "#incidents", label: "Insiden", count: 1 },
  { href: "#history", label: "Riwayat dan rekap" },
];

/**
 * In apps/web the current item follows the route and links are next/link
 * (`renderLink={(props) => <Link {...props} />}`); here a click just moves
 * the current mark so the indicator can be seen sliding.
 */
function Demo({ items, variant }: { items: NavTabsItem[]; variant?: "pill" | "underline" }) {
  const [current, setCurrent] = useState(items[1]?.href ?? "");
  return (
    <NavTabs
      aria-label="Bagian halaman"
      variant={variant}
      items={items.map((item) => ({ ...item, current: item.href === current }))}
      renderLink={({ href, className, "aria-current": ariaCurrent, children }) => (
        <a
          href={href}
          className={className}
          aria-current={ariaCurrent}
          onClick={(event) => {
            event.preventDefault();
            setCurrent(href);
          }}
        >
          {children}
        </a>
      )}
    />
  );
}

function Gallery() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-heading text-fg">Pill</h3>
        <Demo items={STAFF} />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-heading text-fg">Underline</h3>
        <Demo items={GUESTBOOK} variant="underline" />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-heading text-fg">Satu item: tidak tampil</h3>
        <NavTabs
          aria-label="Absensi"
          items={[{ href: "#mine", label: "Absensi saya", current: true }]}
        />
        <p className="text-body-sm text-fg-muted">(kosong di atas ini)</p>
      </section>
    </div>
  );
}

const meta: Meta<typeof NavTabs> = {
  title: "Components/NavTabs",
  component: NavTabs,
};
export default meta;
type Story = StoryObj<typeof NavTabs>;

export const Variants: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Gallery />,
};
