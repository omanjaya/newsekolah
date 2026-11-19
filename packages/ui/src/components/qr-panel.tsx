"use client";

import { RotateCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { cn } from "../utils/cn.js";

import { Button } from "./button.js";
import { Skeleton } from "./skeleton.js";
import { useUiLabels } from "./ui-labels.js";

export interface QrPanelProps {
  /** Encoded into the QR itself; a scanner reads this. */
  payload: string;
  /** Shown as plain text underneath, for a manual fallback entry; "" hides it. */
  code: string;
  expiresAt: string;
  onRenew: () => void;
  renewing: boolean;
  /** Defaults to `UiLabels.qrExpired`. */
  expiredLabel?: string;
  /** Defaults to `UiLabels.qrExpiresIn`. */
  expiresInLabel?: (secondsLeft: number) => string;
  /**
   * "countdown" (default) a ring and a seconds count, for a code that lives
   * seconds; "until" the time it stops working and no ring, for a code the
   * server issued for hours (a gate pass that lasts the school day), which
   * offers a new code only once it has run out. Chosen by the caller, who
   * knows what the server issued, never guessed from the device clock.
   */
  expiryDisplay?: "countdown" | "until";
  /**
   * With `expiryDisplay="until"`, the line under the code, given the expiry
   * instant: "Berlaku sampai pukul 15.59". Pass one that formats in the
   * school's timezone; the default formats `UiLabels.qrValidUntil` in the
   * browser's.
   */
  validUntilLabel?: (expiresAt: string) => string;
  /** Defaults to `UiLabels.qrRenew`. */
  renewLabel?: string;
  /** The QR's accessible name, e.g. "Kode QR masuk kelas". Defaults to `UiLabels.qrCode`. */
  label?: string;
  /**
   * "md" (default) a 224px code for a desk or a card; "lg" fills the panel
   * up to min(60vh, 420px), for a kiosk or a duty screen read from afar.
   */
  size?: "md" | "lg";
  /**
   * Asks for a new code by itself when this one expires, for an unattended
   * screen: once at expiry, then, while renewals fail (or keep returning a
   * code that is already expired), again after 5, 15 and 60 seconds. After
   * that it stops and leaves the "Buat kode baru" button to a person.
   */
  autoRenew?: boolean;
  className?: string;
}

/** Waits before each retry of a failed automatic renewal; past the last one, none. */
const QR_AUTO_RENEW_RETRY_MS: readonly number[] = [5_000, 15_000, 60_000];

/**
 * A short-lived QR in a calm frame: the code large on a white tile (in both
 * themes, which is what a camera reads best), a ring that empties as the
 * code runs out, and the typed fallback underneath. Tokens are single-use
 * and short-lived, so the panel asks for a new one when the current one
 * expires (docs/05-shared-components.md `QrDisplay`).
 */
export function QrPanel(props: QrPanelProps): ReactElement {
  const { expiresAt, onRenew, renewing, autoRenew = false } = props;
  // Which code the countdown saw run out; a new code is alive until its own does.
  const [expiredCode, setExpiredCode] = useState<string | null>(null);
  useAutoRenew({
    expiresAt,
    expired: expiredCode === expiresAt,
    enabled: autoRenew,
    renewing,
    onRenew,
  });
  // Keyed on expiresAt so a renewed token restarts the countdown cleanly.
  return (
    <Countdown
      key={expiresAt}
      {...props}
      onExpire={() => {
        setExpiredCode(expiresAt);
      }}
    />
  );
}

/**
 * Asks for a new code once per expiry, then retries on
 * `QR_AUTO_RENEW_RETRY_MS` while renewals fail: `renewing` falling back to
 * false with the same expired code is a failure, and so is a renewal that
 * brings back a code already expired (a client clock far ahead of the
 * server). Lives above the keyed countdown so a remount keeps the count.
 */
function useAutoRenew({
  expiresAt,
  expired,
  enabled,
  renewing,
  onRenew,
}: {
  expiresAt: string;
  expired: boolean;
  enabled: boolean;
  renewing: boolean;
  onRenew: () => void;
}): void {
  const attempts = useRef(0);
  const onRenewRef = useRef(onRenew);
  useEffect(() => {
    onRenewRef.current = onRenew;
  });
  // A code that arrives alive means the last renewal worked.
  useEffect(() => {
    if (remaining(expiresAt) > 0) attempts.current = 0;
  }, [expiresAt]);
  useEffect(() => {
    if (!expired || !enabled || renewing) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waitFor = (attempt: number) => QR_AUTO_RENEW_RETRY_MS[attempt - 1];
    const renew = () => {
      const attempt = attempts.current;
      attempts.current = attempt + 1;
      onRenewRef.current();
      // The next try is already on the clock, so a renewal that fails
      // without `renewing` ever showing still backs off. A live code, or
      // `renewing` going true, clears it.
      const delay = waitFor(attempt + 1);
      if (delay !== undefined) timer = setTimeout(renew, delay);
    };
    const attempt = attempts.current;
    if (attempt === 0) renew();
    else {
      const delay = waitFor(attempt);
      if (delay !== undefined) timer = setTimeout(renew, delay);
    }
    return () => {
      clearTimeout(timer);
    };
  }, [expired, enabled, renewing]);
}

/** A QR is read best dark on white, so its tile stays white in both themes. */
// eslint-disable-next-line no-restricted-syntax -- the QR tile is white in both themes
const QR_TILE = "bg-white";

/** "15.59" (id-ID) or "15:59" (en-GB), in the browser's timezone. */
function clockTime(expiresAt: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(expiresAt));
}

/** Up to this many characters the fallback code is a human code, set large. */
const SHORT_CODE_LENGTH = 12;

function remaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function Countdown({
  payload,
  code,
  expiresAt,
  onRenew,
  renewing,
  expiredLabel,
  expiresInLabel,
  expiryDisplay = "countdown",
  validUntilLabel,
  renewLabel,
  label,
  size = "md",
  className,
  onExpire,
}: QrPanelProps & { onExpire: () => void }): ReactElement {
  const labels = useUiLabels();
  // Only the *transition* to expired lives here, not the 1s tick itself: a
  // kiosk/duty screen keeps this panel mounted indefinitely, and re-running
  // `Countdown` every second would reconcile the whole QR subtree forever
  // for no visual change. The tick lives in `CountdownStatus` instead.
  const [expired, setExpired] = useState(() => remaining(expiresAt) <= 0);
  const longLived = expiryDisplay === "until";

  const large = size === "lg";
  return (
    <div
      data-slot="qr-panel"
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-border bg-surface shadow-1",
        large ? "p-6 md:p-8" : "p-5",
        className,
      )}
    >
      <div
        className={cn(
          "relative rounded-md p-3 ring-1 ring-border transition-opacity duration-base",
          QR_TILE,
          large ? "w-full max-w-[min(60vh,420px)]" : "w-56",
          expired && "opacity-20",
        )}
      >
        <QRCodeSVG
          value={payload}
          size={512}
          level="M"
          marginSize={0}
          role="img"
          aria-label={label ?? labels.qrCode}
          aria-hidden={expired || undefined}
          className="block h-auto w-full"
        />
      </div>
      <CountdownStatus
        expiresAt={expiresAt}
        large={large}
        expiredLabel={expiredLabel ?? labels.qrExpired}
        expiresInLabel={expiresInLabel ?? labels.qrExpiresIn}
        validUntil={
          longLived
            ? (validUntilLabel?.(expiresAt) ??
              labels.qrValidUntil(clockTime(expiresAt, labels.locale)))
            : undefined
        }
        onExpire={() => {
          setExpired(true);
          onExpire();
        }}
      />
      {code !== "" && (
        <div className="flex w-full max-w-sm flex-col items-center gap-1.5">
          <span className="text-caption text-fg-muted">{labels.qrManualCode}</span>
          {/* A short code ("K7F 2QD") is read aloud and typed, so it is set
              large and spaced; a raw token only has to be copied whole. */}
          <code
            className={cn(
              "w-full rounded-sm bg-surface-sunken px-3 py-2 text-center break-all text-fg select-all",
              code.length <= SHORT_CODE_LENGTH
                ? cn(large ? "text-title-lg" : "text-title", "tracking-widest")
                : cn(large ? "text-body" : "text-body-sm", "font-mono"),
            )}
          >
            {code}
          </code>
        </div>
      )}
      {(!longLived || expired) && (
        <Button
          variant={expired ? "primary" : "ghost"}
          size="sm"
          icon={<RotateCw />}
          onClick={onRenew}
          loading={renewing}
        >
          {renewLabel ?? labels.qrRenew}
        </Button>
      )}
    </div>
  );
}

const RING_RADIUS = 9;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Owns the 1s interval and re-renders every tick, but nothing above it
 * does: it reports the expiry transition through `onExpire` (called once)
 * instead of lifting the ticking state. The ring steps once a second
 * rather than gliding, so nothing animates continuously on a screen that
 * stays open all day. With `validUntil` (a long-lived code) it shows that
 * line and no ring, but still watches for the expiry.
 */
function CountdownStatus({
  expiresAt,
  large,
  expiredLabel,
  expiresInLabel,
  validUntil,
  onExpire,
}: {
  expiresAt: string;
  large: boolean;
  expiredLabel: string;
  expiresInLabel: (secondsLeft: number) => string;
  validUntil?: string;
  onExpire: () => void;
}): ReactElement {
  const [secondsLeft, setSecondsLeft] = useState(() => remaining(expiresAt));
  // The ring's full length is the time this code had when it appeared.
  const [total] = useState(() => Math.max(1, remaining(expiresAt)));

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(remaining(expiresAt));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [expiresAt]);

  useEffect(() => {
    if (secondsLeft <= 0) onExpire();
  }, [secondsLeft, onExpire]);

  const expired = secondsLeft <= 0;
  const fraction = Math.min(1, secondsLeft / total);
  const urgent = !expired && secondsLeft <= 10;
  return (
    <div className="flex items-center gap-2">
      {validUntil === undefined && (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={cn("-rotate-90", large ? "size-6" : "size-5")}
        >
          <circle
            cx="12"
            cy="12"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="3"
            className="stroke-line"
          />
          <circle
            cx="12"
            cy="12"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - fraction)}
            className={cn(urgent ? "stroke-warning" : "stroke-accent", expired && "opacity-0")}
          />
        </svg>
      )}
      <p
        className={cn(
          "tabular-nums",
          large ? "text-body" : "text-body-sm",
          expired ? "text-danger" : "text-fg-muted",
        )}
      >
        {expired ? expiredLabel : (validUntil ?? expiresInLabel(secondsLeft))}
      </p>
      {/* Announces the expiry once, not every second of the countdown. */}
      <span className="sr-only" aria-live="polite">
        {expired ? expiredLabel : ""}
      </span>
    </div>
  );
}

/** The panel's shape while the first code is being issued. */
export function QrPanelSkeleton({
  size = "md",
  className,
}: {
  size?: "md" | "lg";
  className?: string;
}): ReactElement {
  const large = size === "lg";
  return (
    <div
      aria-busy="true"
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-border bg-surface shadow-1",
        large ? "p-6 md:p-8" : "p-5",
        className,
      )}
    >
      <Skeleton
        className={cn(
          "aspect-square rounded-md",
          large ? "w-full max-w-[min(60vh,420px)]" : "w-56",
        )}
      />
      <Skeleton className="h-4 w-36 rounded-sm" />
      <Skeleton className="h-9 w-full max-w-sm rounded-sm" />
    </div>
  );
}
