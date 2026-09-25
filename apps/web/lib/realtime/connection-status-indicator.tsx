"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useLiveSocketStatus } from "./live-socket-provider";

/**
 * Below this, a brief reconnect (a single deploy restart, a network blip)
 * never shows -- only a disconnect that has actually outlasted the first
 * couple of backoff attempts is worth interrupting the reader for
 * (docs/analysis/realtime-plan-2026-09-25.md section 1.5 #4: the previous
 * client gave up silently after 6 failed attempts with no visible sign at
 * all; this is the opposite failure mode, flashing on every hiccup, that
 * a naive "just show `status !== open`" would produce instead).
 */
const SUSTAINED_DISCONNECT_MS = 8_000;

/**
 * Small, unobtrusive status pill (docs/analysis/realtime-plan-2026-09-25.md
 * chunk D): invisible while the socket is healthy, connecting for the
 * first time, or briefly reconnecting, and only appears once a disconnect
 * has stayed down for SUSTAINED_DISCONNECT_MS. A deliberate pause for a
 * long-hidden tab ("paused" status, LiveSocketProvider) is never shown --
 * that is expected, not trouble worth reporting.
 *
 * Mounted from apps/web/components/app-shell.tsx, positioned over the
 * header (see that file's comment) rather than edited into
 * components/header.tsx directly, which is outside this chunk's scope.
 */
export function ConnectionStatusIndicator(): ReactElement | null {
  const t = useTranslations("app.shell.realtime");
  const status = useLiveSocketStatus();
  const disconnected = status === "connecting" || status === "reconnecting";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!disconnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the provider's own status, not deriving from props/state available at render time.
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      setVisible(true);
    }, SUSTAINED_DISCONNECT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [disconnected]);

  if (!visible) return null;

  return (
    <span
      role="status"
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-[11px] font-medium text-fg-muted shadow-(--shadow-float)"
    >
      <WifiOff className="size-3.5 shrink-0 text-status-late" aria-hidden="true" />
      {t("reconnecting")}
    </span>
  );
}
