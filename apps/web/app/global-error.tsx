"use client";

import type { ReactElement } from "react";
import { useEffect } from "react";

/**
 * Replaces the entire document, including the root layout, so it cannot
 * assume the i18n provider, Tailwind classes, or any other context from
 * layout.tsx rendered successfully — that layout is exactly what just
 * threw. Kept to plain inline styles and hardcoded Indonesian copy for
 * that reason; this screen exists to be readable when everything else
 * has failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          backgroundColor: "#F7F6F3",
          color: "#1A1A1A",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 8px" }}>Aplikasi gagal dimuat</p>
          <p style={{ fontSize: 13, color: "#635F57", margin: "0 0 16px" }}>
            Coba muat ulang halaman. Bila terus terjadi, hubungi dukungan sekolah.
            {error.digest ? ` Kode: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              backgroundColor: "#1F3A5F",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
