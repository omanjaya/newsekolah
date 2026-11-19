"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect } from "react";

/*
 * Replaces the entire document, including the root layout, so it cannot
 * assume the i18n provider, the stylesheet, or any other context from
 * layout.tsx rendered successfully: that layout is exactly what just threw.
 * It mirrors StatePage (danger icon in a soft circle, title, one sentence,
 * the action, a small code) with its own plain CSS, carrying the Hijau
 * Segar token values for both themes, and hardcoded Indonesian copy; this
 * screen exists to be readable when everything else has failed. For the
 * same reason its title and button are plain HTML, not the shared
 * components: those would render unstyled here.
 */
const STYLES = `
  :root { color-scheme: light dark; }
  .ge-body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    padding: 24px; box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #F7F6F2; color: #1B1D1A;
  }
  .ge-box { max-width: 448px; display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center; }
  .ge-icon { width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center; background: #FBE2DE; color: #B3261E; }
  .ge-title { margin: 0 0 8px; font-size: 18px; line-height: 24px; font-weight: 700; letter-spacing: -0.01em; }
  .ge-text { margin: 0; font-size: 14px; line-height: 20px; color: #5E625B; }
  .ge-button {
    height: 40px; padding: 0 16px; border: 0; border-radius: 14px; cursor: pointer;
    background: #0F7A5F; color: #FFFFFF; font: inherit; font-size: 13px; font-weight: 600;
  }
  .ge-button:focus-visible { outline: 2px solid #0F7A5F; outline-offset: 2px; }
  .ge-code { margin: 0; font-size: 12px; line-height: 16px; color: #5E625B; }
  @media (prefers-color-scheme: dark) {
    .ge-body { background: #171613; color: #F4F2EC; }
    .ge-icon { background: #3B1815; color: #F0776B; }
    .ge-text, .ge-code { color: #A6A39A; }
    .ge-button { background: #2FD6A0; color: #06261D; }
    .ge-button:focus-visible { outline-color: #2FD6A0; }
  }
`;

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
      <head>
        <style>{STYLES}</style>
      </head>
      <body className="ge-body">
        <main className="ge-box">
          <span className="ge-icon" aria-hidden="true">
            <TriangleAlert size={28} />
          </span>
          <div>
            {/* eslint-disable-next-line design-system/no-raw-elements -- no stylesheet here, see the note at the top */}
            <h1 className="ge-title">Aplikasi gagal dimuat</h1>
            <p className="ge-text">
              {error.digest
                ? "Muat ulang halaman ini, dan bila tetap gagal, beri tahu admin sekolah kode di bawah."
                : "Muat ulang halaman ini. Bila tetap gagal, hubungi admin sekolah."}
            </p>
          </div>
          {/* eslint-disable-next-line design-system/no-raw-elements -- no stylesheet here, see the note at the top */}
          <button type="button" className="ge-button" onClick={reset}>
            Coba lagi
          </button>
          {error.digest && <p className="ge-code">Kode: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
