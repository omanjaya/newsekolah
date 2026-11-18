import type { Meta, StoryObj } from "@storybook/react";

import { domainIcons } from "../icons.js";
import { phoneViewport } from "../stories/phone-viewport.js";

import { Card, CardHeader, CardTitle } from "./card.js";
import { EmptyState } from "./empty-state.js";
import { FilteredEmptyState } from "./filtered-empty-state.js";
import { FirstUseEmptyState } from "./first-use-empty-state.js";
import { TextLink } from "./text-link.js";

const meta: Meta<typeof EmptyState> = {
  title: "Components/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

const AnnouncementIcon = domainIcons.announcement;
const PermitIcon = domainIcons.exitPermit;

function Gallery() {
  return (
    <div className="flex max-w-default flex-col gap-6">
      {/* The first-use preset: nothing created yet, the add action always there. */}
      <FirstUseEmptyState
        icon={<PermitIcon />}
        title="Belum ada izin keluar"
        description="Izin yang diajukan siswa hari ini akan muncul di sini."
        actionLabel="Ajukan izin"
        onAction={() => undefined}
        secondaryAction={<TextLink href="#">Pelajari alurnya</TextLink>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pengumuman terbaru</CardTitle>
          </CardHeader>
          {/* Inside a Card the default renders without its own frame. */}
          <EmptyState
            icon={<AnnouncementIcon />}
            title="Belum ada pengumuman"
            description="Pengumuman sekolah akan muncul di sini."
          />
        </Card>
        <Card padding="md">
          <CardTitle>Pengumuman terbaru</CardTitle>
          <EmptyState
            variant="compact"
            icon={<AnnouncementIcon />}
            title="Belum ada pengumuman"
            description="Kabar baru muncul di sini."
            action={<TextLink href="#">Buat</TextLink>}
          />
        </Card>
      </div>
      <FilteredEmptyState onReset={() => undefined} />
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
