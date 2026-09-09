import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";

function DropdownMenuDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">Akun</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Bu Siti Aminah</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Profil</DropdownMenuItem>
        <DropdownMenuItem>Sesi dan keamanan</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Keluar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const meta: Meta<typeof DropdownMenuDemo> = {
  title: "Components/DropdownMenu",
  component: DropdownMenuDemo,
};
export default meta;
type Story = StoryObj<typeof DropdownMenuDemo>;

export const Default: Story = {};
