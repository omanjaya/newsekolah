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
    // A person types well past the scanner's 30ms average between keys.
    const person = userEvent.setup({ delay: 60 });
    await person.type(screen.getByLabelText("Kode"), "K7F2QD{Enter}");
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledWith(
        expect.objectContaining({ code: "K7F2QD", source: "manual" }),
      );
    });
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Kode")).toHaveValue("");
  });

  it("keeps the manual send button enabled and says what is missing when it is empty", async () => {
    const onScan = vi.fn();
    render(<Scanner onScan={onScan} />);
    const send = screen.getByRole("button", { name: "Kirim" });
    expect(send).toBeEnabled();
    await userEvent.click(send);
    const field = screen.getByLabelText("Kode");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Ketik atau tempel kode lebih dulu.");
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    expect(onScan).not.toHaveBeenCalled();
  });

  it("clears the missing-code message once a code is typed and sent", async () => {
    const onScan = vi.fn();
    render(<Scanner onScan={onScan} />);
    await userEvent.click(screen.getByRole("button", { name: "Kirim" }));
    const person = userEvent.setup({ delay: 60 });
    await person.type(screen.getByLabelText("Kode"), "K7F2QD");
    expect(screen.queryByText("Ketik atau tempel kode lebih dulu.")).not.toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "Kirim" }));
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledTimes(1);
    });
    // The field empties after a send; that is not flagged as a new mistake.
    expect(screen.getByLabelText("Kode")).toHaveValue("");
    expect(screen.queryByText("Ketik atau tempel kode lebih dulu.")).not.toBeInTheDocument();
  });

  it("clears the missing-code message when a hardware scanner sends a code", async () => {
    const onScan = vi.fn();
    render(<Scanner onScan={onScan} />);
    await userEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(screen.getByText("Ketik atau tempel kode lebih dulu.")).toBeInTheDocument();
    // userEvent's default typing is scanner speed: the whole code in a few ms.
    await userEvent.type(screen.getByLabelText("Kode"), "sion:gate:abc{Enter}");
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ source: "scanner" }));
    });
    expect(screen.getByLabelText("Kode")).toHaveValue("");
    expect(screen.queryByText("Ketik atau tempel kode lebih dulu.")).not.toBeInTheDocument();
  });

  it("clears the missing-code message when the camera reads a code", async () => {
    const codes = ["A"];
    class FakeDetector {
      detect() {
        const next = codes.shift();
        return Promise.resolve(next ? [{ rawValue: next }] : []);
      }
    }
    Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: FakeDetector });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    installCamera(() => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] }));
    const onScan = vi.fn().mockResolvedValue(true);
    render(<Scanner onScan={onScan} manualEntry="open" autoStart={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(screen.getByText("Ketik atau tempel kode lebih dulu.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nyalakan kamera" }));
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ code: "A", source: "camera" }));
    });
    expect(screen.queryByText("Ketik atau tempel kode lebih dulu.")).not.toBeInTheDocument();
  });

  it("disables the manual send button only while the scanner is busy", () => {
    render(<Scanner onScan={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Kirim" })).toBeDisabled();
  });

  it("reports a hardware scan into the focused manual field once", async () => {
    const onScan = vi.fn();
    render(<Scanner onScan={onScan} />);
    // userEvent's default typing is scanner speed: the whole code in a few ms.
    await userEvent.type(screen.getByLabelText("Kode"), "sion:gate:abc{Enter}");
    await waitFor(() => {
      expect(onScan).toHaveBeenCalledWith(
        expect.objectContaining({ code: "sion:gate:abc", source: "scanner" }),
      );
    });
    // Let the scan queue settle before counting.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onScan).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole("heading", { name: "Pindai" })).toHaveClass("text-kiosk-title");
  });

  it("reads a kiosk result on the kiosk title role", () => {
    render(
      <Scanner
        variant="kiosk"
        onScan={vi.fn()}
        result={{ tone: "success", title: "Buku dipinjam", description: "Kembali Sabtu", key: 1 }}
      />,
    );
    expect(screen.getByText("Buku dipinjam")).toHaveClass("text-kiosk-title");
    expect(screen.getByText("Kembali Sabtu")).toHaveClass("text-body-lg");
  });

  it("fills the screen as a kiosk unless it sits inside a kiosk frame", () => {
    const { container, rerender } = render(<Scanner variant="kiosk" onScan={vi.fn()} />);
    const section = () => container.querySelector("[data-slot=scanner]");
    expect(section()).toHaveClass("min-h-dvh", "bg-bg", "px-4");
    expect(section()).toHaveAttribute("data-full-screen");

    rerender(<Scanner variant="kiosk" fullScreen={false} onScan={vi.fn()} />);
    expect(section()).not.toHaveClass("min-h-dvh");
    expect(section()).not.toHaveClass("bg-bg");
    expect(section()).not.toHaveClass("px-4");
    expect(section()).not.toHaveAttribute("data-full-screen");
    expect(section()).toHaveClass("w-full", "items-center");

    // An ordinary page's scanner is a card either way.
    rerender(<Scanner fullScreen={false} onScan={vi.fn()} />);
    expect(section()).toHaveClass("rounded-lg", "bg-surface");
  });

  it("puts a page's camera beside its field once the panel is wide, framed once", () => {
    installCamera(() => Promise.resolve({ getTracks: () => [] }));
    const { container } = render(<Scanner onScan={vi.fn()} autoStart={false} />);
    const section = container.querySelector("[data-slot=scanner]");
    const viewfinder = container.querySelector("[data-slot=scanner-viewfinder]");
    expect(section).toHaveClass("@container");
    // Camera and field side by side by the panel's own width, not the window's.
    expect(viewfinder?.parentElement).toHaveClass("@3xl:grid");
    // Square on a phone, 4:3 and capped from sm up, and no outline inside the card.
    expect(viewfinder).toHaveClass(
      "aspect-square",
      "sm:aspect-[4/3]",
      "sm:max-h-[min(45dvh,24rem)]",
    );
    expect(viewfinder).not.toHaveClass("border");
  });

  it("keeps a kiosk's viewfinder outlined on the bare screen", () => {
    installCamera(() => Promise.resolve({ getTracks: () => [] }));
    const { container } = render(<Scanner variant="kiosk" onScan={vi.fn()} autoStart={false} />);
    expect(container.querySelector("[data-slot=scanner-viewfinder]")).toHaveClass("border");
  });

  it("stacks a page's field without a camera instead of leaving a column empty", () => {
    const { container } = render(<Scanner onScan={vi.fn()} camera={false} manualEntry="open" />);
    const field = screen.getByLabelText("Kode");
    expect(container.querySelector(".\\@3xl\\:grid")).toBeNull();
    expect(field).toBeInTheDocument();
  });

  it("ends the header row with the caller's control, beside the ready chip", () => {
    render(
      <Scanner
        title="Izin keluar"
        onScan={vi.fn()}
        camera={false}
        headerEnd={<button type="button">Ganti mode</button>}
      />,
    );
    const control = screen.getByRole("button", { name: "Ganti mode" });
    const heading = screen.getByRole("heading", { name: "Izin keluar" });
    // The same row as the title, after it.
    expect(control.closest(".justify-between")).toBe(heading.closest(".justify-between"));
  });

  // The late-arrival reason sat above the card as a bare field, before
  // the heading that says what the screen is for.
  it("puts the lead between the header and the camera", () => {
    installCamera(() => Promise.resolve({ getTracks: () => [] }));
    render(
      <Scanner
        title="Pindai QR di meja piket"
        onScan={vi.fn()}
        autoStart={false}
        lead={<textarea aria-label="Alasan" />}
      />,
    );
    const heading = screen.getByRole("heading", { name: "Pindai QR di meja piket" });
    const field = screen.getByRole("textbox", { name: "Alasan" });
    const camera = screen.getByRole("button", { name: "Nyalakan kamera" });
    const scanner = heading.closest('[data-slot="scanner"]');
    expect(scanner).toContainElement(field);
    expect(heading.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(camera) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
