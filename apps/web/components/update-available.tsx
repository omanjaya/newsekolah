"use client";

import { Button } from "@newsekolah/ui";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { ShellStrip } from "./shell-strip";

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

  // A strip in the header's sticky stack like every other standing state,
  // rather than a card floating over the page and the phone's tab bar.
  return (
    <ShellStrip
      tone="info"
      icon={<RefreshCw />}
      title={t("title")}
      detail={t("body")}
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => registration.waiting?.postMessage({ type: "SKIP_WAITING" })}
        >
          {t("action")}
        </Button>
      }
    />
  );
}
