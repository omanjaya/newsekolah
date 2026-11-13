import type { Meta, StoryObj } from "@storybook/react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Card } from "./card.js";
import { SkeletonCards, SkeletonDetail, SkeletonForm, SkeletonList } from "./skeleton-presets.js";
import { Skeleton } from "./skeleton.js";

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Line: Story = { args: { className: "h-4 w-48" } };
export const Block: Story = { args: { className: "h-24 w-64" } };

function Presets() {
  return (
    <div className="flex max-w-default flex-col gap-8">
      <SkeletonCards />
      <div className="grid gap-6 md:grid-cols-2">
        <SkeletonList rows={4} />
        <Card padding="md">
          <SkeletonForm fields={3} />
        </Card>
      </div>
      <SkeletonDetail rows={5} />
    </div>
  );
}

export const PresetsGallery: Story = { name: "Presets", render: () => <Presets /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Presets /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => <Presets />,
};
