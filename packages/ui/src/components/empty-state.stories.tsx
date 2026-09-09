import type { Meta, StoryObj } from "@storybook/react";

import { domainIcons } from "../icons.js";

import { Button } from "./button.js";
import { EmptyState } from "./empty-state.js";

const meta: Meta<typeof EmptyState> = {
  title: "Components/EmptyState",
  component: EmptyState,
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

const AnnouncementIcon = domainIcons.announcement;

export const Default: Story = {
  args: {
    icon: <AnnouncementIcon />,
    title: "Belum ada pengumuman",
    description: "Pengumuman yang dibuat akan muncul di sini.",
    action: <Button size="sm">Buat pengumuman</Button>,
  },
};
