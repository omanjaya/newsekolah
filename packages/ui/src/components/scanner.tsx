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
} from "react";

import { createDuplicateScanGuard } from "../hooks/duplicate-scan-guard.js";
import { useBarcodeScanner, type BarcodeScanEvent } from "../hooks/use-barcode-scanner.js";
import {
  isCameraSupported,
  queryCameraPermission,
  useCameraScanner,
  type CameraStatus,
} from "../hooks/use-camera-scanner.js";
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
  /** Fires once per accepted scan: camera, hardware scanner or manual entry. `false` marks a failure. */
  onScan: (event: BarcodeScanEvent) => ScanHandlerResult | Promise<ScanHandlerResult>;
  title?: ReactNode;
  description?: ReactNode;
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
  onScan,
  title,
  description,
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

  // One scan at a time, in order: a slow handler is never overlapped by the
  // next code read in the same second.
  const submit = useCallback(
    (event: BarcodeScanEvent) => {
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
    [onScan],
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

  useBarcodeScanner({
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
  const header = (title !== undefined || description !== undefined) && (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {title !== undefined && (
          <h2 className={kiosk ? "text-display text-fg" : "text-heading text-fg"}>{title}</h2>
        )}
        {description !== undefined && (
          <p className={cn("text-fg-muted", kiosk ? "text-body" : "text-body-sm")}>{description}</p>
        )}
      </div>
      {ready}
    </div>
  );

  const manual = manualEntry !== false && (
    <ManualEntry
      kiosk={kiosk}
      open={manualOpen || !cameraOffered}
      collapsible={cameraOffered && manualEntry !== "open"}
      onToggle={() => {
        setManualOpen((current) => !current);
      }}
      value={value}
      onChange={setValue}
      onSubmit={submitManual}
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
      className={cn(
        "flex flex-col",
        kiosk
          ? "min-h-dvh w-full items-center gap-6 bg-bg px-4 py-8 sm:px-8 md:py-12"
          : "gap-4 rounded-lg border border-border bg-surface p-4 shadow-1 md:p-5",
        className,
      )}
    >
      <div className={cn("flex w-full flex-col", kiosk ? "max-w-3xl gap-6" : "gap-4")}>
        {header}
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
          />
        )}
        {/* Always mounted, so a new result is announced, not just shown. */}
        <div aria-live="polite" aria-atomic="true" className="empty:hidden">
          {result && <ScannerResultBanner key={result.key} result={result} variant={variant} />}
        </div>
        {manual}
        {children}
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
  disabled: boolean;
  label: string;
  placeholder: string;
  submitLabel: string;
}): ReactElement {
  const labels = useUiLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  // Opening the fallback (from the toggle or a camera that cannot be used)
  // puts the caret in it; a field shown from the start waits for a tap.
  useEffect(() => {
    if (open && collapsible) inputRef.current?.focus();
  }, [open, collapsible]);
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
        <div
          className={cn(
            "flex flex-col gap-2 sm:flex-row sm:items-end",
            collapsible && "animate-enter",
          )}
        >
          <Field label={label} className={cn("min-w-0 flex-1", kiosk && "[&_label]:text-heading")}>
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
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              className={cn(kiosk && "h-16 px-4 text-title md:pointer-fine:h-16")}
            />
          </Field>
          <Button
            disabled={disabled || value.trim() === ""}
            onClick={onSubmit}
            className={cn(kiosk && "h-16 px-8 text-heading md:h-16")}
          >
            {submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
