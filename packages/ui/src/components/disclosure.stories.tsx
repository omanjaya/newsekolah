import type { Meta, StoryObj } from "@storybook/react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Badge } from "./badge.js";
import { Card } from "./card.js";
import { Checkbox } from "./checkbox.js";
import {
  Disclosure,
  DisclosureContent,
  DisclosureIndicator,
  DisclosureTrigger,
} from "./disclosure.js";
import { Field } from "./field.js";
import { Input } from "./input.js";

const meta: Meta<typeof Disclosure> = {
  title: "Components/Disclosure",
  component: Disclosure,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Disclosure>;

const PERMISSIONS = ["Lihat presensi", "Isi presensi", "Ubah presensi yang sudah terkirim"];

function Gallery() {
  return (
    <div className="flex w-[32rem] max-w-full flex-col gap-6">
      {/* A group header that opens its rows, as on the roles page. */}
      <Card padding="none">
        <Disclosure defaultOpen>
          <DisclosureTrigger className="flex min-h-12 w-full items-center gap-3 rounded-md px-5">
            <span className="min-w-0 flex-1 truncate text-heading text-fg">Presensi</span>
            <Badge tone="warning" size="sm" dot>
              Diubah
            </Badge>
            <span className="text-body-sm text-fg-muted tabular-nums">2 dari 3</span>
            <DisclosureIndicator />
          </DisclosureTrigger>
          <DisclosureContent asChild>
            <ul className="flex flex-col px-5 pb-3">
              {PERMISSIONS.map((label, index) => (
                <li key={label}>
                  <Checkbox label={label} defaultChecked={index < 2} />
                </li>
              ))}
            </ul>
          </DisclosureContent>
        </Disclosure>
      </Card>

      {/* A quiet "more fields" toggle inside a form. */}
      <Disclosure>
        <DisclosureTrigger className="flex min-h-11 items-center gap-1.5 self-start rounded-md text-label text-fg-muted hover:text-fg">
          <DisclosureIndicator className="text-current" />
          Lanjutan
        </DisclosureTrigger>
        <DisclosureContent className="pt-2">
          <Field label="Kode tahap" hint="Dipakai permintaan yang sedang berjalan.">
            <Input defaultValue="wali_kelas" className="font-mono" />
          </Field>
        </DisclosureContent>
      </Disclosure>
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
