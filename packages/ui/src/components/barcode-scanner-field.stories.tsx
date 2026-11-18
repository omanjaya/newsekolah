import type { Decorator, Meta, StoryObj } from "@storybook/react";

import { BarcodeScannerField } from "./barcode-scanner-field.js";

/**
 * The dense desk field (default) and the kiosk size (large), which holds
 * its 64px controls at every width and stacks the input over two equal
 * buttons.
 */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Gallery() {
  return (
    <div className="flex w-[44rem] max-w-full flex-col gap-10">
      <BarcodeScannerField
        label="Barcode eksemplar"
        placeholder="Pindai atau ketik barcode"
        onScan={() => undefined}
        stretch
      />
      <BarcodeScannerField
        label="Kartu anggota"
        submitLabel="Masuk"
        size="large"
        onScan={() => undefined}
      />
    </div>
  );
}

const meta: Meta<typeof Gallery> = {
  title: "Components/BarcodeScannerField",
  component: Gallery,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Gallery>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = { parameters: { layout: "fullscreen" }, decorators: [phoneFrame] };
