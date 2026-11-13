import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { QrPanel, QrPanelSkeleton } from "./qr-panel.js";

/** A short-lived QR at desk size and kiosk size, running, nearly out, expired and loading. */
const PAYLOAD =
  "sion:class-entry:01a0d82e-d45c-7214-a147-30867df2ab3b:VMcKUoUrjUqy4myD8G59lGLneyvkjGgB5QMJ9rN";
const CODE = "K7F 2QD";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function inSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function Live({ seconds, size }: { seconds: number; size?: "md" | "lg" }) {
  const [expiresAt, setExpiresAt] = useState(() => inSeconds(seconds));
  return (
    <QrPanel
      payload={PAYLOAD}
      code={CODE}
      expiresAt={expiresAt}
      size={size}
      label="Kode QR masuk kelas"
      renewing={false}
      onRenew={() => {
        setExpiresAt(inSeconds(30));
      }}
    />
  );
}

function Gallery() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Live seconds={30} />
      <Live seconds={7} />
      <Live seconds={0} />
      <QrPanelSkeleton />
    </div>
  );
}

const meta: Meta<typeof Gallery> = {
  title: "Components/QrPanel",
  component: Gallery,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Gallery>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Live seconds={30} />,
};
export const Kiosk: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-xl">
      <Live seconds={25} size="lg" />
    </div>
  ),
};
