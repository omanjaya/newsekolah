"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Camera, ScanLine } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";

import { createDuplicateScanGuard } from "../hooks/duplicate-scan-guard.js";
import { useBarcodeScanner } from "../hooks/use-barcode-scanner.js";
import type { BarcodeScanEvent } from "../hooks/use-barcode-scanner.js";
import { isCameraSupported, useCameraScanner } from "../hooks/use-camera-scanner.js";
import { cn } from "../utils/cn.js";

import { Button } from "./button.js";
import { Input } from "./input.js";
import { ScannerViewfinder, type ScannerFlash } from "./scanner-viewfinder.js";
import { useUiLabels } from "./ui-labels.js";

export type { BarcodeScanEvent, BarcodeScanSource } from "../hooks/use-barcode-scanner.js";

/**
 * What `onScan` may return. In `continuous` camera mode `false` flashes the
 * camera overlay as a failure; anything else (including nothing) is a
 * success. Outside continuous mode the value is ignored.
 */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- existing handlers return void
export type ScanHandlerResult = boolean | void;

const CAMERA_DUPLICATE_WINDOW_MS = 2000;
const CAMERA_FEEDBACK_MS = 700;

export interface BarcodeScannerFieldProps {
  label: string;
  /** Fires once per accepted scan, whether from the hardware scanner, the camera, or manual entry. */
  onScan: (event: BarcodeScanEvent) => ScanHandlerResult | Promise<ScanHandlerResult>;
  placeholder?: string;
  /** Defaults to `UiLabels.scannerFieldSubmit` ("Catat"). */
  submitLabel?: string;
  /** Defaults to `UiLabels.scannerCamera` ("Pindai dengan kamera"). */
  cameraLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  minLength?: number;
  maxAverageIntervalMs?: number;
  duplicateWindowMs?: number;
  /**
   * "large" raises the input, label, and buttons to a size readable and
   * tappable at arm's length, at every width, and stacks them (input
   * across, then the two buttons side by side), for a self-service kiosk.
   * Default "default" matches the compact desk/back-office density. For a
   * whole scan screen, prefer `Scanner`.
   */
  size?: "default" | "large";
  /**
   * Let the manual-entry input grow to fill the row (and the full width on
   * a phone) instead of keeping its intrinsic width. Off by default so the
   * existing desk layouts are unchanged.
   */
  stretch?: boolean;
  /**
   * Keep the camera open after a read: every distinct code fires `onScan`
   * once (the same code is ignored for 2 seconds), the frame flashes
   * green or red from the handler's result, and a "done" button closes it.
   * Off by default: the camera closes after the first code.
   */
  continuous?: boolean;
  /** Label of the button that closes the continuous camera. Defaults to `UiLabels.scannerCameraDone`. */
  doneLabel?: string;
  /** Shown under the video while the camera is open, e.g. the latest scan result. */
  cameraFooter?: ReactNode;
}

/*
 * The large size owns its heights at every width, including the md/fine
 * pointer breakpoints Input and Button use for their compact boxes: a
 * kiosk is read from arm's length on a desktop screen too.
 */
const LARGE_INPUT = "h-16 px-4 text-title-lg font-sans font-normal md:pointer-fine:h-16";
/** At the desk the field matches the 40px buttons beside it, so the row reads as one bar. */
const DESK_INPUT = "md:pointer-fine:h-10";
const LARGE_BUTTON = "h-16 flex-1 px-8 text-heading md:h-16 md:pointer-fine:h-16";

/**
 * A scan token this size never overflows this: "sion:<kind>:<uuid>:<token>"
 * (apps/web/features/permits/api.ts's encodeScanPayload) -- the longest
 * kind in use ("approve", 7 chars) plus a 36-character UUID plus a
 * 43-character token is 93 characters. A browser's native maxLength drops
 * excess pasted characters silently, so the cap must stay above that.
 */
const MANUAL_ENTRY_MAX_LENGTH = 128;

function subscribeNever(): () => void {
  return () => undefined;
}

/**
 * A field that reads a physical barcode scanner (a very fast keyboard
 * ending with Enter) from anywhere on the page, not only while this input
 * has focus, plus a full-screen camera where the browser has one, plus
 * plain manual entry. All three paths funnel through the same `onScan`
 * callback and the same duplicate suppression, so callers only implement
 * one handler.
 */
export function BarcodeScannerField({
  label,
  onScan,
  placeholder,
  submitLabel,
  cameraLabel,
  disabled = false,
  autoFocus = false,
  className,
  minLength,
  maxAverageIntervalMs,
  duplicateWindowMs = 1500,
  size = "default",
  stretch = false,
  continuous = false,
  doneLabel,
  cameraFooter,
}: BarcodeScannerFieldProps): ReactElement {
  const labels = useUiLabels();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraSupported = useSyncExternalStore(subscribeNever, isCameraSupported, () => false);
  const large = size === "large";
  const manualGuard = useRef(
    createDuplicateScanGuard(continuous ? CAMERA_DUPLICATE_WINDOW_MS : duplicateWindowMs),
  );

  useBarcodeScanner({
    onScan: (event) => {
      setValue("");
      void onScan(event);
    },
    enabled: !disabled,
    minLength,
    maxAverageIntervalMs,
    duplicateWindowMs,
  });

  const submitManual = () => {
    const code = value.trim();
    if (!code) return;
    if (!manualGuard.current.accept(code, Date.now())) return;
    setValue("");
    void onScan({ code, source: "manual", at: Date.now() });
  };

  return (
    <div
      className={cn(
        large ? "flex w-full max-w-xl flex-col gap-3" : "flex flex-wrap items-end gap-3",
        className,
      )}
    >
      <div className={cn("flex flex-col gap-2", stretch && !large && "min-w-0 flex-1 basis-60")}>
        <label htmlFor={inputId} className={large ? "text-title text-fg" : "text-label text-fg"}>
          {label}
        </label>
        <Input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitManual();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          maxLength={MANUAL_ENTRY_MAX_LENGTH}
          className={large ? LARGE_INPUT : DESK_INPUT}
        />
      </div>
      <div className={cn("flex gap-3", large ? "w-full" : "contents")}>
        <Button
          onClick={submitManual}
          disabled={disabled}
          className={large ? LARGE_BUTTON : undefined}
        >
          {submitLabel ?? labels.scannerFieldSubmit}
        </Button>
        {cameraSupported && (
          <Button
            variant="secondary"
            icon={<ScanLine aria-hidden="true" />}
            disabled={disabled}
            onClick={() => {
              setCameraOpen(true);
            }}
            className={large ? LARGE_BUTTON : undefined}
          >
            {cameraLabel ?? labels.scannerCamera}
          </Button>
        )}
      </div>
      {cameraOpen && (
        <CameraOverlay
          title={cameraLabel ?? labels.scannerCamera}
          continuous={continuous}
          closeLabel={
            continuous ? (doneLabel ?? labels.scannerCameraDone) : labels.scannerCameraClose
          }
          footer={cameraFooter}
          onDetect={async (code) => {
            if (!continuous) setCameraOpen(false);
            if (!manualGuard.current.accept(code, Date.now())) return "skipped";
            return (await onScan({ code, source: "camera", at: Date.now() })) !== false;
          }}
          onClose={() => {
            setCameraOpen(false);
          }}
          onManualEntry={() => {
            setCameraOpen(false);
            // After the dialog hands focus back to the camera button.
            setTimeout(() => {
              inputRef.current?.focus();
            }, 0);
          }}
        />
      )}
    </div>
  );
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

interface CameraOverlayProps {
  title: string;
  onDetect: (code: string) => Promise<boolean | "skipped">;
  onClose: () => void;
  onManualEntry: () => void;
  continuous: boolean;
  closeLabel: string;
  footer: ReactNode;
}

/**
 * The full-screen camera for schools without a dedicated hardware scanner:
 * a modal dialog (focus kept inside, Escape closes it) over the camera's
 * own black backdrop, above every shell bar. It closes itself after one
 * code unless `continuous`; a refused or missing camera says so and
 * offers manual entry instead of closing without a word.
 */
function CameraOverlay({
  title,
  onDetect,
  onClose,
  onManualEntry,
  continuous,
  closeLabel,
  footer,
}: CameraOverlayProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [flash, setFlash] = useState<ScannerFlash>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Detections are handled one at a time so a slow handler is never
  // overlapped by the next code in the same frame.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const { status, retry } = useCameraScanner({
    enabled: true,
    videoRef,
    continuous,
    onDetect: (code) => {
      queue.current = queue.current.then(async () => {
        let result: boolean | "skipped";
        try {
          result = await onDetect(code);
        } catch {
          result = false;
        }
        if (!continuous || result === "skipped") return;
        vibrate(result ? 80 : [80, 60, 80]);
        setFlash(result ? "success" : "failure");
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => {
          setFlash(null);
        }, CAMERA_FEEDBACK_MS);
      });
    },
  });

  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
    },
    [],
  );

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        {/* A camera screen is dark in both themes: the overlay and what sits on
            it take the dark tokens, which `data-theme` scopes to them. */}
        <DialogPrimitive.Overlay
          data-theme="dark"
          className="fixed inset-0 z-modal bg-bg/90 data-[state=open]:animate-overlay-in"
        />
        <DialogPrimitive.Content
          data-theme="dark"
          aria-describedby={undefined}
          className="fixed inset-0 z-modal flex flex-col items-center justify-center gap-4 p-4 text-fg outline-none data-[state=open]:animate-fade-in sm:p-6"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <ScannerViewfinder
            status={status}
            videoRef={videoRef}
            flash={flash}
            onRetry={retry}
            onManualEntry={onManualEntry}
            className="aspect-[3/4] max-h-[70dvh] max-w-md sm:aspect-[4/3]"
          />
          {footer && (
            <div aria-live="polite" className="w-full max-w-md">
              {footer}
            </div>
          )}
          <Button variant="secondary" icon={<Camera aria-hidden="true" />} onClick={onClose}>
            {closeLabel}
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
