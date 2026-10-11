"use client";

import { Camera, ScanLine } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { createDuplicateScanGuard } from "../hooks/duplicate-scan-guard.js";
import { useBarcodeScanner } from "../hooks/use-barcode-scanner.js";
import type { BarcodeScanEvent } from "../hooks/use-barcode-scanner.js";
import { cn } from "../utils/cn.js";

import { Button } from "./button.js";
import { Input } from "./input.js";

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
  submitLabel?: string;
  cameraLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  minLength?: number;
  maxAverageIntervalMs?: number;
  duplicateWindowMs?: number;
  /**
   * "large" raises the input, label, and buttons to a size readable and
   * tappable at arm's length, for a self-service kiosk station. Default
   * "default" matches the compact desk/back-office density.
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
   * once (the same code is ignored for 2 seconds), the overlay flashes
   * green or red from the handler's result, and a "done" button closes it.
   * Off by default: the camera closes after the first code.
   */
  continuous?: boolean;
  /** Label of the button that closes the continuous camera. */
  doneLabel?: string;
  /** Shown under the video while the camera is open, e.g. the latest scan result. */
  cameraFooter?: ReactNode;
}

const SIZE_INPUT_CLASS: Record<NonNullable<BarcodeScannerFieldProps["size"]>, string> = {
  default: "",
  large: "h-16 text-[24px]",
};

const SIZE_LABEL_CLASS: Record<NonNullable<BarcodeScannerFieldProps["size"]>, string> = {
  default: "text-[13px]",
  large: "text-[20px]",
};

const SIZE_BUTTON_CLASS: Record<NonNullable<BarcodeScannerFieldProps["size"]>, string> = {
  default: "",
  large: "h-16 px-8 text-[20px]",
};

/**
 * A scan token this size never overflows this: "sion:<kind>:<uuid>:<token>"
 * (apps/web/features/permits/api.ts's encodeScanPayload) -- the longest
 * kind in use ("approve", 7 chars) plus a 36-character UUID plus a
 * 43-character token (32 random bytes, URL-safe base64,
 * apps/api/internal/modules/permits/service/scantoken.go's
 * IssueScanToken) is 93 characters. The previous cap of 64 silently
 * truncated that (a browser's native maxLength just drops the excess
 * keystrokes/pasted characters, no error), so the exact case this field's
 * own "atau tempel kodenya" ("or paste the code") hint promises -- pasting
 * the gate QR's full encoded payload when a camera or hardware scanner
 * is not available -- always failed with a generic "invalid code" from
 * the server, which had received a hash of the truncated string. A scan
 * source that only ever submits the bare token (e.g. the approve-stage
 * scanner, which already knows the instance id from its own props) stays
 * well under either cap.
 */
const MANUAL_ENTRY_MAX_LENGTH = 128;

/**
 * A field that reads a physical barcode scanner (a very fast keyboard
 * ending with Enter) from anywhere on the page, not only while this input
 * has focus, plus an optional camera fallback where the browser exposes
 * `BarcodeDetector`, plus plain manual entry for when neither is
 * available. All three paths funnel through the same `onScan` callback and
 * the same duplicate suppression, so callers only implement one handler.
 */
export function BarcodeScannerField({
  label,
  onScan,
  placeholder,
  submitLabel = "Catat",
  cameraLabel = "Pindai dengan kamera",
  disabled = false,
  autoFocus = false,
  className,
  minLength,
  maxAverageIntervalMs,
  duplicateWindowMs = 1500,
  size = "default",
  stretch = false,
  continuous = false,
  doneLabel = "Selesai",
  cameraFooter,
}: BarcodeScannerFieldProps): ReactElement {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
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
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <label
        htmlFor={inputId}
        className={cn(
          "flex flex-col gap-1",
          SIZE_LABEL_CLASS[size],
          stretch && "min-w-0 flex-1 basis-60",
        )}
      >
        <span className="font-medium">{label}</span>
        <Input
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
          maxLength={MANUAL_ENTRY_MAX_LENGTH}
          className={SIZE_INPUT_CLASS[size]}
        />
      </label>
      <Button
        type="button"
        onClick={submitManual}
        disabled={disabled}
        className={SIZE_BUTTON_CLASS[size]}
      >
        {submitLabel}
      </Button>
      {isCameraSupported() && (
        <Button
          type="button"
          variant="secondary"
          icon={<ScanLine aria-hidden="true" />}
          disabled={disabled}
          onClick={() => {
            setCameraOpen(true);
          }}
          className={SIZE_BUTTON_CLASS[size]}
        >
          {cameraLabel}
        </Button>
      )}
      {cameraOpen && (
        <CameraScanner
          continuous={continuous}
          doneLabel={doneLabel}
          footer={cameraFooter}
          onDetect={async (code) => {
            if (!continuous) setCameraOpen(false);
            if (!manualGuard.current.accept(code, Date.now())) return "skipped";
            return (await onScan({ code, source: "camera", at: Date.now() })) !== false;
          }}
          onClose={() => {
            setCameraOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Whether the camera button should render at all -- only needs
 * `getUserMedia`, not `BarcodeDetector`: iOS Safari has the former but not
 * the latter, and `CameraScanner` below falls back to a JS decoder there.
 */
function isCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function hasNativeBarcodeDetector(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

interface BarcodeDetectorResult {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
}

interface CameraScannerProps {
  onDetect: (code: string) => Promise<boolean | "skipped">;
  onClose: () => void;
  continuous: boolean;
  doneLabel: string;
  footer: ReactNode;
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

/**
 * A minimal camera overlay for schools without a dedicated hardware
 * scanner. It closes itself as soon as one code is read (unless
 * `continuous`, which stays open until dismissed), or when the
 * reader dismisses it; the video stream is always stopped on unmount so a
 * background tab never keeps the camera light on.
 *
 * Detection prefers the native `BarcodeDetector` API (zero extra bytes,
 * fastest) where the browser has it. iOS Safari never has it, so there the
 * effect lazily imports `@zxing/browser` -- a maintained wrapper around the
 * ZXing multi-format decoder (QR plus the Code 128/EAN barcodes the library
 * desk scans) -- the same "load only the screen that needs it" pattern as
 * `exceljs` in `apps/web/features/library/import-lib.ts`, so pages that
 * never open the camera never pay for the decoder.
 */
function CameraScanner({
  onDetect,
  onClose,
  continuous,
  doneLabel,
  footer,
}: CameraScannerProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [flash, setFlash] = useState<"success" | "failure" | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The effect below subscribes once (re-subscribing would restart the
  // camera), so it reads the latest callback through a ref.
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  });
  // Detections are handled one at a time so a slow handler is never
  // overlapped by the next code in the same frame.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const handleDetect = (code: string) => {
    queue.current = queue.current.then(async () => {
      let result: boolean | "skipped";
      try {
        result = await onDetectRef.current(code);
      } catch {
        result = false;
      }
      if (!continuous || result === "skipped") return;
      const ok = result;
      vibrate(ok ? 80 : [80, 60, 80]);
      setFlash(ok ? "success" : "failure");
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => {
        setFlash(null);
      }, CAMERA_FEEDBACK_MS);
    });
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let fallbackControls: { stop: () => void } | null = null;

    const runNativeDetector = () => {
      const DetectorCtor = (window as unknown as { BarcodeDetector: new () => BarcodeDetectorLike })
        .BarcodeDetector;
      const detector = new DetectorCtor();

      const tick = () => {
        if (stopped || !videoRef.current) return;
        detector
          .detect(videoRef.current)
          .then((results) => {
            const [first] = results;
            if (first && !stopped) {
              handleDetect(first.rawValue);
              if (!continuous) {
                stopped = true;
                return;
              }
            }
            frame = requestAnimationFrame(tick);
          })
          .catch(() => {
            frame = requestAnimationFrame(tick);
          });
      };
      frame = requestAnimationFrame(tick);
    };

    const runFallbackDecoder = async (mediaStream: MediaStream) => {
      const { BrowserMultiFormatReader } = await import(
        /* webpackChunkName: "zxing-browser" */ "@zxing/browser"
      );
      if (stopped || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      // decodeFromStream binds mediaStream to the video element itself and
      // keeps calling back until controls.stop() -- no rAF loop of our own.
      fallbackControls = await reader.decodeFromStream(mediaStream, videoRef.current, (result) => {
        if (result && !stopped) {
          if (!continuous) stopped = true;
          handleDetect(result.getText());
        }
      });
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((mediaStream) => {
        if (stopped) {
          mediaStream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        stream = mediaStream;
        if (hasNativeBarcodeDetector()) {
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            void videoRef.current.play();
          }
          runNativeDetector();
        } else {
          void runFallbackDecoder(mediaStream);
        }
      })
      .catch(() => {
        stopped = true;
        onClose();
      });

    return () => {
      stopped = true;
      clearTimeout(flashTimer.current);
      cancelAnimationFrame(frame);
      fallbackControls?.stop();
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDetect reads refs and onClose is a call-site closure, re-subscribing on every render would restart the camera
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-6">
      <video
        ref={videoRef}
        data-flash={flash ?? undefined}
        className={cn(
          "max-h-[70vh] w-full max-w-md rounded-sm bg-black outline-4 outline-offset-0 transition-[outline-color] duration-150",
          flash === "success" && "outline-success",
          flash === "failure" && "outline-danger",
          flash === null && "outline-transparent",
        )}
        muted
        playsInline
      />
      {footer && (
        <div aria-live="polite" className="w-full max-w-md">
          {footer}
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        icon={<Camera aria-hidden="true" />}
        onClick={onClose}
      >
        {continuous ? doneLabel : "Tutup kamera"}
      </Button>
    </div>
  );
}
