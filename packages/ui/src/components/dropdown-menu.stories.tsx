import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Copy, LogOut, Moon, Pencil, Printer, Settings, Trash2, User } from "lucide-react";
import { useState } from "react";

import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function AccountMenu() {
  const [theme, setTheme] = useState("system");
  const [compact, setCompact] = useState(true);
  return (
    <div className="flex min-h-[28rem] justify-end p-4">
      <DropdownMenu defaultOpen modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">Akun</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Admin Contoh</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={<User />}>Profil</DropdownMenuItem>
            <DropdownMenuItem icon={<Settings />} shortcut="Ctrl ,">
              Pengaturan
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Tampilan</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="system">Ikuti sistem</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">Terang</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Gelap</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuCheckboxItem checked={compact} onCheckedChange={setCompact}>
            Tabel padat
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<LogOut />} tone="danger">
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RowMenu() {
  return (
    <div className="flex min-h-[20rem] p-4">
      <DropdownMenu defaultOpen modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" icon={<Moon />}>
            Aksi
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem icon={<Pencil />} shortcut="E">
            Ubah
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Copy />} shortcut="Ctrl D">
            Duplikat
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Printer />} disabled>
            Cetak kartu
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Trash2 />} tone="danger" shortcut="Del">
            Hapus
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const meta: Meta = {
  title: "Components/DropdownMenu",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const Account: Story = { render: () => <AccountMenu /> };
export const RowActions: Story = { render: () => <RowMenu /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <AccountMenu /> };
export const Phone: Story = { decorators: [phoneFrame], render: () => <AccountMenu /> };
