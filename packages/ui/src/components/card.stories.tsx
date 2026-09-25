import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card.js";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Basic: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Pengumuman</CardTitle>
        <CardDescription>Diperbarui 2 jam lalu</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-[13px] text-fg">Ujian tengah semester dimulai minggu depan.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="secondary">
          Lihat semua
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Bare: Story = {
  render: () => (
    <Card className="max-w-xs p-5">
      <p className="text-[13px] text-fg-muted">Kartu tanpa header/footer, padding manual.</p>
    </Card>
  ),
};
