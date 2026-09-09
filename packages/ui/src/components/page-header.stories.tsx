import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { PageHeader } from "./page-header.js";

const meta: Meta<typeof PageHeader> = {
  title: "Components/PageHeader",
  component: PageHeader,
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {
  args: {
    eyebrow: "Kesiswaan",
    title: "Pelanggaran",
    breadcrumb: [{ label: "Beranda", href: "#" }, { label: "Pelanggaran" }],
    actions: <Button size="sm">Catat pelanggaran</Button>,
  },
};
