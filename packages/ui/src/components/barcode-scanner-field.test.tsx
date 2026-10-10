import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BarcodeScannerField } from "./barcode-scanner-field.js";

describe("BarcodeScannerField", () => {
  // Regression test: the manual-entry input's maxLength used to be 64,
  // which silently truncated a full "sion:<kind>:<uuid>:<token>" scan
  // payload (apps/web/features/permits/api.ts's encodeScanPayload) --
  // exactly what a reader pasting a gate QR's code by hand (this field's
  // own "atau tempel kodenya" hint) needs to submit whole. A truncated
  // paste hashes to a different value server-side, so every manual gate
  // scan failed with a generic "invalid code" (caught by
  // apps/web/e2e/simulation/exit-permit.spec.ts against a real stack: the
  // security duty's manual entry of a real gate payload consistently
  // 410'd, SCAN_TOKEN_GONE).
  it("accepts a full sion:<kind>:<uuid>:<token> gate-scan payload without truncating it", async () => {
    const user = userEvent.setup();
    const onScan = vi.fn();
    render(<BarcodeScannerField label="Kode QR gerbang" onScan={onScan} />);

    // "sion:gate:" (10) + a UUID (36) + ":" (1) + a 43-char token
    // (scantoken.go's IssueScanToken: 32 random bytes, URL-safe base64) =
    // 90 characters, comfortably below this field's cap but well past the
    // old 64-character one.
    const payload =
      "sion:gate:01a0d82e-d45c-7214-a147-30867df2ab3b:VMcKUoUrjUqy4myD8G59lGLneyvkjGgB5QMJ9rNeg2A";
    expect(payload.length).toBeGreaterThan(64);

    const input = screen.getByLabelText("Kode QR gerbang");
    await user.type(input, payload);
    expect(input).toHaveValue(payload);

    await user.click(screen.getByRole("button", { name: "Catat" }));
    expect(onScan).toHaveBeenCalledWith(
      expect.objectContaining({ code: payload, source: "manual" }),
    );
  });
});

describe("BarcodeScannerField continuous camera", () => {
  let codes: string[] = [];

  function installCamera() {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
    });
    class FakeDetector {
      detect() {
        const next = codes.shift();
        return Promise.resolve(next ? [{ rawValue: next }] : []);
      }
    }
    Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: FakeDetector });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    return stop;
  }

  afterEach(() => {
    Reflect.deleteProperty(window, "BarcodeDetector");
    Reflect.deleteProperty(navigator, "mediaDevices");
    Reflect.deleteProperty(navigator, "vibrate");
    codes = [];
  });

  it("keeps the camera open, fires each distinct code once, and closes on the done button", async () => {
    const stop = installCamera();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    codes = ["A", "A", "B", "A"];
    const onScan = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const user = userEvent.setup();
    render(<BarcodeScannerField label="Kode" onScan={onScan} continuous cameraLabel="Kamera" />);

    await user.click(screen.getByRole("button", { name: "Kamera" }));
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledTimes(2);
    });
    // Repeats of "A" inside the 2s window are dropped; "B" is distinct; the
    // trailing "A" is not the latest code any more so it fires again.
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledTimes(3);
    });
    expect(onScan.mock.calls.map(([event]) => (event as { code: string }).code)).toEqual([
      "A",
      "B",
      "A",
    ]);
    expect(onScan.mock.calls[0]?.[0]).toMatchObject({ source: "camera" });
    expect(vibrate).toHaveBeenCalled();

    // Camera still open after several reads.
    expect(screen.getByRole("button", { name: "Selesai" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Selesai" }));
    expect(screen.queryByRole("button", { name: "Selesai" })).not.toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
  });

  it("closes after the first code when not continuous", async () => {
    installCamera();
    codes = ["A", "B"];
    const onScan = vi.fn();
    const user = userEvent.setup();
    render(<BarcodeScannerField label="Kode" onScan={onScan} cameraLabel="Kamera" />);

    await user.click(screen.getByRole("button", { name: "Kamera" }));
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Tutup kamera" })).not.toBeInTheDocument();
  });
});
