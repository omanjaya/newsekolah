import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Toaster, toast, useToast } from "./toast.js";
import { UiLabelsProvider } from "./ui-labels.js";

// sonner captures the pointer for its swipe-to-dismiss; jsdom has no pointer capture.
beforeAll(() => {
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

describe("toast", () => {
  it("useToast returns the same plain API toast exposes, without needing a component", () => {
    expect(useToast()).toBe(toast);
  });

  it("renders a success message through the mounted Toaster", async () => {
    render(<Toaster />);
    toast.success("Presensi tersimpan");
    await waitFor(() => {
      expect(screen.getByText("Presensi tersimpan")).toBeInTheDocument();
    });
  });

  it("renders an error message with its retry action", async () => {
    render(<Toaster />);
    const onRetry = vi.fn();
    toast.error("Gagal menyimpan presensi", {
      description: "Periksa koneksi lalu coba lagi.",
      retry: { label: "Coba lagi", onClick: onRetry },
    });
    await waitFor(() => {
      expect(screen.getByText("Gagal menyimpan presensi")).toBeInTheDocument();
      expect(screen.getByText("Periksa koneksi lalu coba lagi.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
    });
  });

  it("announces an error through a role=alert live region for screen readers", async () => {
    render(<Toaster />);
    toast.error("Gagal menyimpan presensi");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Gagal menyimpan presensi");
    });
  });

  it("does not raise an alert-role region for a success toast", async () => {
    render(<Toaster />);
    toast.success("Presensi tersimpan");
    await waitFor(() => {
      expect(screen.getByText("Presensi tersimpan")).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toHaveTextContent("Presensi tersimpan");
  });

  it("runs an optional action on a success toast", async () => {
    render(<Toaster />);
    const onUndo = vi.fn();
    toast.success("Buku dikembalikan", { action: { label: "Urungkan", onClick: onUndo } });
    await userEvent.click(await screen.findByRole("button", { name: "Urungkan" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("shows warning and info toasts and returns each toast's id for dismiss", async () => {
    render(<Toaster />);
    let id: string | number = "";
    act(() => {
      id = toast.warning("Jadwal bentrok dengan Fisika");
      toast.info("Presensi tersimpan di perangkat");
    });
    expect(await screen.findByText("Jadwal bentrok dengan Fisika")).toBeInTheDocument();
    expect(screen.getByText("Presensi tersimpan di perangkat")).toBeInTheDocument();
    act(() => {
      toast.dismiss(id);
    });
    await waitFor(() =>
      expect(screen.queryByText("Jadwal bentrok dengan Fisika")).not.toBeInTheDocument(),
    );
  });

  it("puts the icon in a soft circle of the kind's tone", async () => {
    render(<Toaster />);
    toast.error("Gagal menyimpan");
    await waitFor(() => {
      expect(document.querySelector('[data-sonner-toast][data-type="error"]')).not.toBeNull();
    });
    const item = document.querySelector('[data-sonner-toast][data-type="error"]');
    expect(item?.className ?? "").toContain("[&_[data-icon]]:bg-danger-soft");
    expect(item?.querySelector("[data-icon]")).toHaveClass("size-8", "rounded-full");
  });

  // styles.css moves the action under the text when both are there, by
  // this shape: the description inside the content, the action beside it.
  it("is 420 wide from 600px up, and gives a description and an action the shape styles.css stacks", async () => {
    render(<Toaster />);
    toast.error("Gagal menyimpan presensi", {
      description: "Periksa koneksi lalu coba lagi.",
      retry: { label: "Coba lagi", onClick: vi.fn() },
    });
    const description = await screen.findByText("Periksa koneksi lalu coba lagi.");
    expect(description).toHaveClass("text-pretty");
    const item = description.closest("[data-sonner-toast]");
    expect(item?.querySelector(":scope > [data-content] > [data-description]")).toBe(description);
    expect(item?.querySelector(":scope > [data-button]:not([data-cancel])")).toHaveTextContent(
      "Coba lagi",
    );
    expect(
      document
        .querySelector<HTMLElement>("[data-sonner-toaster]")
        ?.style.getPropertyValue("--width"),
    ).toBe("420px");
  });

  it("names its region and an error's close button from UiLabels", async () => {
    render(
      <UiLabelsProvider labels={{ toastRegion: "Notifications", toastClose: "Close" }}>
        <Toaster />
      </UiLabelsProvider>,
    );
    toast.error("Could not save");
    expect(await screen.findByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Notifications/ })).toBeInTheDocument();
  });

  it("has no accessibility violations with a toast showing", async () => {
    const { container } = render(<Toaster />);
    toast.success("Izin berhasil dikirim", { description: "Wali kelas akan meninjau hari ini" });
    await screen.findByText("Izin berhasil dikirim");
    await expectNoAxeViolations(container);
  });
});
