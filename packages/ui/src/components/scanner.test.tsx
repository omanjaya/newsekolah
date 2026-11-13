import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Scanner } from "./scanner.js";

function installCamera(open: () => Promise<unknown>) {
  const getUserMedia = vi.fn(open);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  return getUserMedia;
}

function installPermission(state: PermissionState) {
  const query = vi.fn().mockResolvedValue({ state });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query },
  });
  return query;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
  Reflect.deleteProperty(navigator, "permissions");
  Reflect.deleteProperty(window, "BarcodeDetector");
});

describe("Scanner", () => {
  it("opens on the camera, one tap from starting, and never prompts on its own", async () => {
    const getUserMedia = installCamera(() => Promise.resolve({ getTracks: () => [] }));
    const query = installPermission("prompt");
    render(<Scanner title="Pindai kode QR" onScan={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Nyalakan kamera" })).toBeInTheDocument();
    await waitFor(() => {
      expect(query).toHaveBeenCalled();
    });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("explains a refused camera and offers manual entry instead", async () => {
    installCamera(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    render(<Scanner onScan={vi.fn()} autoStart={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    expect(await screen.findByText("Akses kamera ditolak")).toBeInTheDocument();
    const [fromCamera] = screen.getAllByRole("button", { name: "Masukkan kode manual" });
    if (!fromCamera) throw new Error("Manual entry is missing");
    await userEvent.click(fromCamera);
    expect(screen.getByLabelText("Kode")).toHaveFocus();
  });

  it("says when the device has no camera", async () => {
    installCamera(() => Promise.reject(new DOMException("none", "NotFoundError")));
    render(<Scanner onScan={vi.fn()} autoStart={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    expect(await screen.findByText("Kamera tidak tersedia")).toBeInTheDocument();
  });

  it("shows manual entry outright where there is no camera API, and submits a typed code", async () => {
    const onScan = vi.fn();
    render(<Scanner onScan={onScan} />);
    expect(screen.queryByRole("button", { name: "Nyalakan kamera" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Kode"), "sion:gate:abc{Enter}");
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledWith(
        expect.objectContaining({ code: "sion:gate:abc", source: "manual" }),
      );
    });
    expect(screen.getByLabelText("Kode")).toHaveValue("");
  });

  it("reads codes from the camera continuously and flashes the frame", async () => {
    const codes = ["A", "A", "B"];
    class FakeDetector {
      detect() {
        const next = codes.shift();
        return Promise.resolve(next ? [{ rawValue: next }] : []);
      }
    }
    Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: FakeDetector });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    installCamera(() => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] }));
    installPermission("granted");
    const onScan = vi.fn().mockResolvedValue(true);
    render(<Scanner onScan={onScan} />);
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledTimes(2);
    });
    expect(onScan.mock.calls.map(([event]) => (event as { code: string }).code)).toEqual([
      "A",
      "B",
    ]);
    expect(screen.getByRole("button", { name: "Matikan kamera" })).toBeInTheDocument();
  });

  it("announces the last result in a live region", () => {
    const { rerender } = render(<Scanner onScan={vi.fn()} result={null} />);
    const region = document.querySelector("[aria-live=polite]");
    expect(region).toBeEmptyDOMElement();
    rerender(
      <Scanner
        onScan={vi.fn()}
        result={{ tone: "success", title: "Masuk kelas tercatat", key: 1 }}
      />,
    );
    expect(region).toHaveTextContent("Masuk kelas tercatat");
  });

  it("keeps kiosk type large and ordinary pages on the page scale", () => {
    const { rerender } = render(<Scanner title="Pindai" onScan={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Pindai" })).toHaveClass("text-heading");
    rerender(<Scanner variant="kiosk" title="Pindai" onScan={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Pindai" })).toHaveClass("text-display");
  });

  it("has no accessibility violations", async () => {
    installCamera(() => Promise.resolve({ getTracks: () => [] }));
    const { container } = render(
      <Scanner
        title="Pindai kode QR"
        description="Arahkan kamera ke kode."
        onScan={vi.fn()}
        autoStart={false}
        manualEntry="open"
        result={{ tone: "danger", title: "Kode tidak dikenali", description: "Coba lagi." }}
      />,
    );
    await expectNoAxeViolations(container);
  });
});
