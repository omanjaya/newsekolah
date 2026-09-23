import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { Button } from "./button.js";

export interface QrPanelProps {
  /** Encoded into the QR itself; a scanner reads this. */
  payload: string;
  /** Shown as plain text underneath, for a manual fallback entry. */
  code: string;
  expiresAt: string;
  onRenew: () => void;
  renewing: boolean;
  expiredLabel: string;
  expiresInLabel: (secondsLeft: number) => string;
  renewLabel: string;
}

/**
 * A QR with the raw code underneath and a live countdown. Tokens are
 * single-use and short-lived, so the panel asks for a new one when the
 * current one expires (docs/05-shared-components.md `QrDisplay`).
 */
export function QrPanel(props: QrPanelProps) {
  // Keyed on expiresAt so a renewed token restarts the countdown cleanly.
  return <Countdown key={props.expiresAt} {...props} />;
}

function Countdown({
  payload,
  code,
  expiresAt,
  onRenew,
  renewing,
  expiredLabel,
  expiresInLabel,
  renewLabel,
}: QrPanelProps) {
  // Only the *transition* to expired lives here, not the 1s tick itself: a
  // kiosk/duty screen keeps this panel mounted indefinitely, and re-running
  // `Countdown` every second would reconcile the whole QR subtree (220px
  // SVG) forever for no visual change 59 seconds out of 60. The tick lives
  // in `CountdownText` below instead, which re-renders on its own without
  // touching the QR. This component only re-renders once, when the token
  // actually expires.
  const [expired, setExpired] = useState(() => remaining(expiresAt) <= 0);

  return (
    <div className="flex flex-col items-center gap-3 rounded-sm border border-border bg-surface p-6">
      <div className={expired ? "opacity-30" : undefined} aria-hidden={expired}>
        <QRCodeSVG value={payload} size={220} level="M" marginSize={2} />
      </div>
      <code className="max-w-full break-all rounded-xs bg-bg px-2 py-1 text-center text-[13px] tracking-wide">
        {code}
      </code>
      <CountdownText
        expiresAt={expiresAt}
        expiredLabel={expiredLabel}
        expiresInLabel={expiresInLabel}
        onExpire={() => {
          setExpired(true);
        }}
      />
      <Button
        variant={expired ? "primary" : "secondary"}
        size="sm"
        onClick={onRenew}
        loading={renewing}
      >
        {renewLabel}
      </Button>
    </div>
  );
}

/**
 * Owns the 1s interval and re-renders every tick, but nothing above it
 * does: it reports an expiry transition to the parent through `onExpire`
 * (called once, not on every tick) instead of lifting the ticking state
 * itself.
 */
function CountdownText({
  expiresAt,
  expiredLabel,
  expiresInLabel,
  onExpire,
}: {
  expiresAt: string;
  expiredLabel: string;
  expiresInLabel: (secondsLeft: number) => string;
  onExpire: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() => remaining(expiresAt));

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
  return (
    <p className="text-[13px] text-fg-muted" aria-live="polite">
      {expired ? expiredLabel : expiresInLabel(secondsLeft)}
    </p>
  );
}

function remaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}
