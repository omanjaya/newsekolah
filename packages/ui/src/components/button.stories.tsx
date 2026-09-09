import type { Meta, StoryObj } from "@storybook/react";
import { Plus } from "lucide-react";

import { Button } from "./button.js";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: "Simpan presensi", variant: "primary" } };
export const Secondary: Story = { args: { children: "Batal", variant: "secondary" } };
export const Ghost: Story = { args: { children: "Lihat detail", variant: "ghost" } };
export const Danger: Story = { args: { children: "Hapus akun", variant: "danger" } };
export const WithIcon: Story = {
  args: { children: "Tambah siswa", icon: <Plus /> },
};
export const Loading: Story = { args: { children: "Menyimpan", loading: true } };
export const Disabled: Story = { args: { children: "Simpan presensi", disabled: true } };
