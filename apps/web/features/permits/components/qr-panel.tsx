"use client";

import { Button } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

/**
 * A QR with the raw code underneath and a live countdown. Tokens are
 * single-use and short-lived, so the panel asks for a new one when the
 * current one expires.
 */
export function QrPanel({
  payload,
  code,
  expiresAt,
  onRenew,
  renewing,
}: {
  payload: string;
  code: string;
  expiresAt: string;
  onRenew: () => void;
  renewing: boolean;
}): ReactElement {
  return (
    <Countdown
      key={expiresAt}
      payload={payload}
      code={code}
      expiresAt={expiresAt}
      onRenew={onRenew}
      renewing={renewing}
    />
  );
}

/** Keyed on expiresAt by the parent so a renewed token restarts the clock. */
function Countdown({
  payload,
  code,
  expiresAt,
  onRenew,
  renewing,
}: {
  payload: string;
  code: string;
  expiresAt: string;
  onRenew: () => void;
  renewing: boolean;
}): ReactElement {
  const t = useTranslations("app.permits.qr");
  const [secondsLeft, setSecondsLeft] = useState(() => remaining(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(remaining(expiresAt));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [expiresAt]);

  const expired = secondsLeft <= 0;

  return (
    <div className="flex flex-col items-center gap-3 rounded-sm border border-border bg-surface p-6">
      <div className={expired ? "opacity-30" : undefined} aria-hidden={expired}>
        <QRCodeSVG value={payload} size={220} level="M" marginSize={2} />
      </div>
      <code className="rounded-xs bg-bg px-2 py-1 text-[13px] tracking-wide">{code}</code>
      <p className="text-[13px] text-fg-muted" aria-live="polite">
        {expired ? t("expired") : t("expiresIn", { seconds: secondsLeft })}
      </p>
      <Button
        variant={expired ? "primary" : "secondary"}
        size="sm"
        onClick={onRenew}
        loading={renewing}
      >
        {t("renew")}
      </Button>
    </div>
  );
}

function remaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}
