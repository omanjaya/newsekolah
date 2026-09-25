import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Toaster, toast, useToast } from "./toast.js";

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
});
