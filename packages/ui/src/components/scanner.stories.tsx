import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";

import type { CameraStatus } from "../hooks/use-camera-scanner.js";

import { ScannerResultBanner, type ScannerResultValue } from "./scanner-result.js";
import { ScannerViewfinder } from "./scanner-viewfinder.js";
import { Scanner, type ScannerProps } from "./scanner.js";

/**
 * The scanner in its two variants and every camera state. In Storybook the
 * browser has a camera API but no permission yet, so the viewfinder opens
 * on its "turn the camera on" panel; the states gallery shows the rest.
 */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

/** Makes the browser report a refused camera, before the scanner asks. */
const cameraRefused: Decorator = (Story) => {
  if (typeof navigator !== "undefined" && "permissions" in navigator) {
    Object.defineProperty(navigator.permissions, "query", {
      configurable: true,
      value: () => Promise.resolve({ state: "denied" }),
    });
  }
  return <Story />;
};

function ScannerDemo(props: Partial<ScannerProps>) {
  const count = useRef(0);
  const [result, setResult] = useState<ScannerResultValue | null>(
    props.result ?? {
      tone: "success",
      title: "Masuk kelas tercatat",
      description: "X-A, Matematika, 07.32",
      key: 0,
    },
  );
  return (
    <Scanner
      title="Pindai kode QR"
      description="Arahkan kamera ke kode QR masuk kelas, keterlambatan, izin keluar atau gerbang."
      className={props.variant === "kiosk" ? undefined : "mx-auto w-full max-w-xl"}
      {...props}
      result={result}
      onScan={(event) => {
        count.current += 1;
        const ok = event.code.startsWith("sion:");
        setResult({
          tone: ok ? "success" : "danger",
          title: ok ? "Kode diterima" : "Kode tidak dikenali",
          description: ok ? event.code : "Pastikan kode berasal dari aplikasi sekolah.",
          key: count.current,
        });
        return ok;
      }}
    />
  );
}

const STATES: CameraStatus[] = ["idle", "starting", "active", "denied", "unavailable", "error"];

function ViewfinderStates() {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div className="grid w-[64rem] max-w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {STATES.map((status) => (
        <div key={status} className="flex flex-col gap-2">
          <span className="text-caption text-fg-muted">{status}</span>
          <ScannerViewfinder
            status={status}
            videoRef={videoRef}
            flash={status === "active" ? "success" : null}
            onStart={() => undefined}
            onStop={() => undefined}
            onRetry={() => undefined}
            onManualEntry={() => undefined}
          />
        </div>
      ))}
    </div>
  );
}

const RESULTS: ScannerResultValue[] = [
  { tone: "success", title: "Buku dipinjam", description: "Laskar Pelangi, kembali 21 Nov" },
  { tone: "danger", title: "Kartu tidak aktif", description: "Hubungi pustakawan." },
  { tone: "warning", title: "Terlambat 12 menit", description: "Tercatat untuk wali kelas." },
  { tone: "info", title: "Sudah tercatat", description: "Kunjungan hari ini sudah ada." },
];

function ResultBanners() {
  return (
    <div className="grid w-[64rem] max-w-full gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        {RESULTS.map((result) => (
          <ScannerResultBanner key={result.tone} result={result} />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {RESULTS.map((result) => (
          <ScannerResultBanner key={result.tone} result={result} variant="kiosk" />
        ))}
      </div>
    </div>
  );
}

const meta: Meta<typeof ScannerDemo> = {
  title: "Components/Scanner",
  component: ScannerDemo,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ScannerDemo>;

export const Action: Story = {};
export const ActionDark: Story = { globals: { theme: "dark" } };
export const ActionPhone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
};
export const ManualOpen: Story = { args: { manualEntry: "open" } };
export const CameraRefused: Story = { decorators: [cameraRefused] };
export const Kiosk: Story = {
  args: {
    variant: "kiosk",
    title: "Kios perpustakaan",
    description: "Tempelkan atau pindai kartu anggota untuk mulai.",
    manualEntry: "open",
    manualLabel: "Kartu anggota",
    submitLabel: "Masuk",
    result: { tone: "success", title: "Selamat datang, Nadia", description: "XI IPA 1", key: 0 },
  },
  parameters: { layout: "fullscreen" },
};
export const CameraStates: Story = {
  render: () => <ViewfinderStates />,
};
export const Results: Story = {
  render: () => <ResultBanners />,
};
