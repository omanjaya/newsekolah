import type { Meta, StoryObj } from "@storybook/react";

import { Alert } from "./alert.js";

const meta: Meta<typeof Alert> = {
  title: "Components/Alert",
  component: Alert,
};
export default meta;
type Story = StoryObj<typeof Alert>;

export const Info: Story = {
  args: {
    title: "Tahun ajaran 2026/2027 belum diaktifkan",
    children: "Beberapa laporan akan kosong sampai tahun ajaran diaktifkan.",
  },
};
export const Warning: Story = {
  args: { variant: "warning", title: "Sesi presensi akan ditutup dalam 5 menit" },
};
