import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
