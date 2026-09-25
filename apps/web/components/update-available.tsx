"use client";

import { Button } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

/**
 * Surfaces a waiting service worker instead of silently taking over
 * (app/sw.ts sets `skipWaiting: false` for exactly this reason): the user
 * decides when to reload into the new version.
 */
export function UpdateAvailable(): ReactElement | null {
  const t = useTranslations("app.shell.updateAvailable");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Serwist only emits sw.js for production builds, so registering it in
    // dev just makes the browser log a failed script fetch on every reload.
    if (process.env.NODE_ENV === "development") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (cancelled) return;
        if (reg.waiting && reg.active) {
          setRegistration(reg);
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setRegistration(reg);
            }
          });
        });
      })
      .catch(() => {
        // Registration can fail in dev (serwist disables the SW there) or
        // unsupported browsers; the app works without offline support.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!registration?.waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-(--z-toast) mx-auto flex max-w-sm items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-(--shadow-float) md:bottom-4 md:left-auto md:right-4 md:mx-0"
    >
      <div className="flex-1">
        <p className="text-[13px] font-medium text-fg">{t("title")}</p>
        <p className="text-[13px] text-fg-muted">{t("body")}</p>
      </div>
      <Button size="sm" onClick={() => registration.waiting?.postMessage({ type: "SKIP_WAITING" })}>
        {t("action")}
      </Button>
    </div>
  );
}
