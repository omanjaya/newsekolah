"use client";

import { Keyboard } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";

import { createDuplicateScanGuard } from "../hooks/duplicate-scan-guard.js";
import { useBarcodeScanner, type BarcodeScanEvent } from "../hooks/use-barcode-scanner.js";
import {
  isCameraSupported,
  queryCameraPermission,
  useCameraScanner,
  type CameraStatus,
} from "../hooks/use-camera-scanner.js";
import { useSubmitValidation } from "../hooks/use-submit-validation.js";
import { cn } from "../utils/cn.js";

import type { ScanHandlerResult } from "./barcode-scanner-field.js";
import { Button } from "./button.js";
import { Field } from "./field.js";
import { Input } from "./input.js";
import { ScannerResultBanner, type ScannerResultValue } from "./scanner-result.js";
import { ScannerViewfinder, type ScannerFlash } from "./scanner-viewfinder.js";
import { useUiLabels } from "./ui-labels.js";

const CAMERA_DUPLICATE_WINDOW_MS = 2000;
const FLASH_MS = 700;
/** Long enough for "sion:<kind>:<uuid>:<token>" (93 characters); see BarcodeScannerField. */
const MANUAL_ENTRY_MAX_LENGTH = 128;

export type ScannerVariant = "action" | "kiosk";

export interface ScannerProps {
  /**
   * "action" (default): a panel inside an ordinary page, on the page's
   * type scale. "kiosk": the whole screen of a station read at arm's
   * length, with large type and high-contrast results.
   */
  variant?: ScannerVariant;
  /**
   * Kiosk only. True (default): the scanner is the whole screen, with its
   * own page background, padding and full height. False: it sits inside a
   * kiosk frame that already gives the screen its background, gutters and
   * width (the app's kiosk layout, under a card that says what to do), so
   * it draws only its own content at the kiosk type scale.
   */
  fullScreen?: boolean;
  /** Fires once per accepted scan: camera, hardware scanner or manual entry. `false` marks a failure. */
  onScan: (event: BarcodeScanEvent) => ScanHandlerResult | Promise<ScanHandlerResult>;
  title?: ReactNode;
  description?: ReactNode;
  /**
   * At the end of the header row, after the "ready" chip: a control that
   * belongs to the whole scanner, such as a switch between two modes.
   */
  headerEnd?: ReactNode;
  /**
   * Between the header and the camera: what the reader fills in before
   * scanning (a reason the scan sends along), so the panel reads title,
   * explanation, field, camera instead of a bare field above the card.
   */
  lead?: ReactNode;
  /** The outcome of the last scan, shown large under the camera and announced. */
  result?: ScannerResultValue | null;
  /** Offer the camera at all (default true where the browser has one). */
  camera?: boolean;
  /**
   * Start the camera without a tap when the browser already has
   * permission for it; otherwise one tap on the viewfinder starts it, so a
   * page never opens with a permission prompt. Default true.
   */
  autoStart?: boolean;
  /** Keep reading after a code (default true); false stops the camera after one. */
  continuous?: boolean;
  /** The typed fallback: true (default) behind a toggle, "open" shown from the start, false none. */
  manualEntry?: boolean | "open";
  manualLabel?: string;
  manualPlaceholder?: string;
  submitLabel?: string;
  disabled?: boolean;
  minLength?: number;
  maxAverageIntervalMs?: number;
  duplicateWindowMs?: number;
  /** Under the result: a session history, a basket. */
  children?: ReactNode;
  className?: string;
}

/** Camera support never changes while the page is open. */
function subscribeNever(): () => void {
  return () => undefined;
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

/**
 * The one scanner pattern (docs/07-ui-ux.md section 3): the camera first,
 * in a framed viewfinder; the last result large under it and announced; a
 * hardware scanner heard from anywhere on the page; manual entry as the
 * fallback; and plain words for every camera state (off, refused, missing,
 * failed). Built on the same hooks as `BarcodeScannerField`, which stays
 * for the dense desk fields.
 */
export function Scanner({
  variant = "action",
  fullScreen = true,
  onScan,
  title,
  description,
  headerEnd,
  lead,
  result,
  camera = true,
  autoStart = true,
  continuous = true,
  manualEntry = true,
  manualLabel,
  manualPlaceholder,
  submitLabel,
  disabled = false,
  minLength,
  maxAverageIntervalMs,
  duplicateWindowMs = 1500,
  children,
  className,
}: ScannerProps): ReactElement {
  const labels = useUiLabels();
  const kiosk = variant === "kiosk";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [preStatus, setPreStatus] = useState<CameraStatus>("idle");
  const [manualOpen, setManualOpen] = useState(manualEntry === "open");
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState<ScannerFlash>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const guard = useRef(createDuplicateScanGuard(CAMERA_DUPLICATE_WINDOW_MS));
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The server has no camera to ask about; the first client render after
  // hydration does, so the viewfinder appears without a mismatch.
  const supported = useSyncExternalStore(subscribeNever, isCameraSupported, () => false);
  const cameraOffered = camera && supported;
  // The manual field's "type a code first" state lives here, not in the
  // field: any accepted scan (camera, hardware scanner or typed) answers it.
  const {
    ref: manualRef,
    attempted: manualAttempted,
    check: checkManual,
    reset: resetManual,
  } = useSubmitValidation<HTMLDivElement>();

  // One scan at a time, in order: a slow handler is never overlapped by the
  // next code read in the same second.
  const submit = useCallback(
    (event: BarcodeScanEvent) => {
      resetManual();
      queue.current = queue.current.then(async () => {
        let ok: boolean;
        try {
          ok = (await onScan(event)) !== false;
        } catch {
          ok = false;
        }
        if (event.source !== "camera") return;
        vibrate(ok ? 80 : [80, 60, 80]);
        setFlash(ok ? "success" : "failure");
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => {
          setFlash(null);
        }, FLASH_MS);
      });
    },
    [onScan, resetManual],
  );

  const { status, retry } = useCameraScanner({
    enabled: cameraOffered && cameraOn && !disabled,
    videoRef,
    continuous,
    onDetect: (code) => {
      if (!guard.current.accept(code, Date.now())) return;
      if (!continuous) setCameraOn(false);
      submit({ code, source: "camera", at: Date.now() });
    },
  });

  const hardware = useBarcodeScanner({
    onScan: (event) => {
      setValue("");
      submit(event);
    },
    enabled: !disabled,
    minLength,
    maxAverageIntervalMs,
    duplicateWindowMs,
  });

  useEffect(() => {
    if (!cameraOffered || !autoStart) return;
    let cancelled = false;
    void queryCameraPermission().then((permission) => {
      if (cancelled) return;
      if (permission === "granted") setCameraOn(true);
      else if (permission === "denied") setPreStatus("denied");
    });
    return () => {
      cancelled = true;
    };
  }, [cameraOffered, autoStart]);

  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
    },
    [],
  );

  const submitManual = () => {
    const code = value.trim();
    if (!code || disabled) return;
    // A repeat inside the duplicate window is dropped, but it was still a send.
    resetManual();
    if (!guard.current.accept(code, Date.now())) return;
    setValue("");
    submit({ code, source: "manual", at: Date.now() });
  };

  const viewStatus: CameraStatus = cameraOn ? status : preStatus;
  const openManual =
    manualEntry === false
      ? undefined
      : () => {
          setManualOpen(true);
        };

  // A USB or Bluetooth scanner types into the page from anywhere; with a
  // cursor (where such scanners live) a quiet chip says it is listening.
  const ready = !disabled && (
    <span className="hidden h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 text-caption text-fg-muted md:pointer-fine:inline-flex">
      <span aria-hidden="true" className="size-1.5 animate-live rounded-full bg-success" />
      {labels.scannerReady}
    </span>
  );
  const header = (title !== undefined || description !== undefined || headerEnd !== undefined) && (
    // A wide control at the end (a mode switch) wraps under the title on a
    // narrow screen instead of squeezing it.
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
        {title !== undefined && (
          <h2 className={kiosk ? "text-kiosk-title text-fg" : "text-heading text-fg"}>{title}</h2>
        )}
        {description !== undefined && (
          <p className={cn("text-fg-muted", kiosk ? "text-body" : "text-body-sm")}>{description}</p>
        )}
      </div>
      {headerEnd === undefined ? (
        ready
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          {ready}
          {headerEnd}
        </div>
      )}
    </div>
  );

  const manual = manualEntry !== false && (
    <ManualEntry
      kiosk={kiosk}
      open={manualOpen || !cameraOffered}
      collapsible={cameraOffered && manualEntry !== "open"}
      onToggle={() => {
        // Closing or reopening the field starts it afresh: a "type a code
        // first" from before it was closed is not a mistake made now.
        resetManual();
        setManualOpen((current) => !current);
      }}
      value={value}
      onChange={setValue}
      onSubmit={submitManual}
      entryRef={manualRef}
      attempted={manualAttempted}
      check={checkManual}
      isScanPending={hardware.isScanPending}
      disabled={disabled}
      label={manualLabel ?? labels.scannerManualLabel}
      placeholder={manualPlaceholder ?? labels.scannerManualPlaceholder}
      submitLabel={submitLabel ?? labels.scannerSubmit}
    />
  );

  return (
    <section
      data-slot="scanner"
      data-variant={variant}
      data-full-screen={kiosk && fullScreen ? "" : undefined}
      className={cn(
        "flex flex-col",
        kiosk && "w-full items-center gap-6",
        kiosk && fullScreen && "min-h-dvh bg-bg px-4 py-8 sm:px-8 md:py-12",
        // A panel sizes its layout to its own width (`@container`), not the
        // window's: it may fill a page or sit in one column of two.
        !kiosk && "@container gap-4 rounded-lg border border-border bg-surface p-4 shadow-1 md:p-5",
        className,
      )}
    >
      <div className={cn("flex w-full flex-col", kiosk ? "max-w-6xl gap-8" : "gap-4")}>
        {header}
        {lead}
        {/* A kiosk screen is landscape more often than not: the camera on the
            left, what happened and the fallback on the right, all above the fold.
            A wide panel does the same, so the field and its button are not
            pushed under a camera as wide as the page. */}
        <div
          className={cn(
            "flex flex-col",
            kiosk
              ? "gap-6 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8"
              : cn(
                  "gap-4",
                  cameraOffered &&
                    "@3xl:grid @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:items-start @3xl:gap-6",
                ),
          )}
        >
          {cameraOffered && (
            <ScannerViewfinder
              status={disabled ? "idle" : viewStatus}
              videoRef={videoRef}
              flash={flash}
              variant={variant}
              onStart={
                disabled
                  ? undefined
                  : () => {
                      setCameraOn(true);
                    }
              }
              onStop={() => {
                setCameraOn(false);
              }}
              onRetry={() => {
                setCameraOn(true);
                retry();
              }}
              onManualEntry={openManual}
              // A page's scanner is already a card: no second outline.
              framed={kiosk}
              // A phone's square box stays whole; from sm up the 4:3 box
              // stops short of filling the screen.
              className={kiosk ? "max-h-[min(60dvh,34rem)]" : "sm:max-h-[min(45dvh,24rem)]"}
            />
          )}
          <div className={cn("flex min-w-0 flex-col", kiosk ? "gap-6" : "gap-4")}>
            {/* Always mounted, so a new result is announced, not just shown. */}
            <div aria-live="polite" aria-atomic="true" className="empty:hidden">
              {result && <ScannerResultBanner key={result.key} result={result} variant={variant} />}
            </div>
            {manual}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function ManualEntry({
  kiosk,
  open,
  collapsible,
  onToggle,
  value,
  onChange,
  onSubmit,
  entryRef,
  attempted,
  check,
  isScanPending,
  disabled,
  label,
  placeholder,
  submitLabel,
}: {
  kiosk: boolean;
  open: boolean;
  collapsible: boolean;
  onToggle: () => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /**
   * The form convention: the button stays enabled on an empty field, and
   * pressing it says what is missing and puts the caret back in the field.
   * The Scanner owns this state and clears it on every accepted scan.
   */
  entryRef: RefObject<HTMLDivElement | null>;
  attempted: boolean;
  check: (valid: boolean) => boolean;
  /** A hardware scanner just typed here: its Enter is the scanner hook's, not this field's. */
  isScanPending: () => boolean;
  disabled: boolean;
  label: string;
  placeholder: string;
  submitLabel: string;
}): ReactElement {
  const labels = useUiLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  const empty = value.trim() === "";
  // Opening the fallback (from the toggle or a camera that cannot be used)
  // puts the caret in it; a field shown from the start waits for a tap.
  useEffect(() => {
    if (open && collapsible) inputRef.current?.focus();
  }, [open, collapsible]);
  const submit = () => {
    // A send clears the message (the field empties after it, which is not a
    // new mistake to flag), as does any scan from the camera or a scanner.
    if (!check(!empty)) return;
    onSubmit();
  };
  return (
    <div className="flex flex-col gap-3">
      {collapsible && (
        <Button
          variant="ghost"
          size={kiosk ? "md" : "sm"}
          icon={<Keyboard />}
          aria-expanded={open}
          onClick={onToggle}
          className={cn("self-center text-accent", kiosk && "text-body")}
        >
          {open ? labels.scannerManualHide : labels.scannerManualEntry}
        </Button>
      )}
      {open && (
        // The field and its button share one row inside the Field at every
        // width, so the message under the field sits right below it, never
        // under a button stacked between them.
        <div ref={entryRef} className={cn(collapsible && "animate-enter")}>
          <Field
            label={label}
            error={attempted && empty ? labels.scannerManualRequired : undefined}
            className={cn(kiosk && "[&_label]:text-heading")}
          >
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={value}
                autoComplete="off"
                spellCheck={false}
                maxLength={MANUAL_ENTRY_MAX_LENGTH}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(event) => {
                  onChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  // A hardware scan typed into this field is reported once, by
                  // the page-wide listener, as a "scanner" scan.
                  if (!isScanPending()) submit();
                }}
                className={cn(
                  // On a phone the field gets what the button leaves (about
                  // 170px at 390px): callers keep their placeholders that
                  // short, and a longer one (a translation) ends in an
                  // ellipsis instead of being cut mid-word.
                  "min-w-0 flex-1 text-ellipsis",
                  kiosk && "h-16 px-4 text-title-lg font-sans font-normal md:pointer-fine:h-16",
                )}
              />
              <Button
                disabled={disabled}
                onClick={submit}
                className={cn("shrink-0", kiosk && "h-16 px-5 text-heading sm:px-8 md:h-16")}
              >
                {submitLabel}
              </Button>
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}
