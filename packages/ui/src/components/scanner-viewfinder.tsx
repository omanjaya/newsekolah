"use client";

import { Camera, CameraOff, Keyboard, Loader2, RotateCw, ScanLine, X } from "lucide-react";
import type { ReactElement, ReactNode, RefObject } from "react";

import type { CameraStatus } from "../hooks/use-camera-scanner.js";
import { cn } from "../utils/cn.js";

import { Button } from "./button.js";
import { useUiLabels } from "./ui-labels.js";

export type ScannerFlash = "success" | "failure" | null;

export interface ScannerViewfinderProps {
  status: CameraStatus;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Briefly colours the frame after a read: success or failure. */
  flash?: ScannerFlash;
  /** "action" for a page, "kiosk" for a full-screen station (larger type). */
  variant?: "action" | "kiosk";
  onStart?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  /** Offered beside a camera that cannot be used. */
  onManualEntry?: () => void;
  className?: string;
}

/*
 * The camera feed is media, not a themed surface: it letterboxes on black
 * and its frame and hints are white in both themes, the way every camera
 * app draws them. These are the only fixed colours in the package.
 */
// eslint-disable-next-line no-restricted-syntax -- camera letterbox is black in both themes
const MEDIA_SURFACE = "bg-black";
// eslint-disable-next-line no-restricted-syntax -- white frame and text over the camera feed
const ON_MEDIA = "text-white border-white";
// eslint-disable-next-line no-restricted-syntax -- translucent chip over the camera feed
const MEDIA_CHIP = "bg-black/60 text-white";

/** One L-shaped corner of the aiming frame. */
function Corner({ position }: { position: "tl" | "tr" | "bl" | "br" }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-8 border-current transition-colors",
        position === "tl" && "top-0 left-0 rounded-tl-md border-t-[3px] border-l-[3px]",
        position === "tr" && "top-0 right-0 rounded-tr-md border-t-[3px] border-r-[3px]",
        position === "bl" && "bottom-0 left-0 rounded-bl-md border-b-[3px] border-l-[3px]",
        position === "br" && "right-0 bottom-0 rounded-br-md border-r-[3px] border-b-[3px]",
      )}
    />
  );
}

/** The square the code should sit in, centred on the feed. */
function AimingFrame({ flash, className }: { flash: ScannerFlash; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-flash={flash ?? undefined}
      className={cn(
        "pointer-events-none absolute top-1/2 left-1/2 aspect-square h-3/5 max-w-[80%] -translate-x-1/2 -translate-y-1/2",
        "data-[flash=success]:text-success data-[flash=failure]:text-danger",
        className,
      )}
    >
      <Corner position="tl" />
      <Corner position="tr" />
      <Corner position="bl" />
      <Corner position="br" />
    </span>
  );
}

function Panel({
  icon,
  tone,
  title,
  description,
  kiosk,
  children,
}: {
  icon: ReactNode;
  tone: "neutral" | "accent" | "danger";
  title: string;
  description?: string;
  kiosk: boolean;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface-sunken p-6 text-center">
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full",
          kiosk ? "size-16 [&>svg]:size-8" : "size-12 [&>svg]:size-6",
          tone === "accent" && "bg-accent-soft text-accent-soft-fg",
          tone === "danger" && "bg-danger-soft text-danger",
          tone === "neutral" && "bg-surface text-fg-muted",
        )}
      >
        {icon}
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className={cn("text-fg", kiosk ? "text-title-lg" : "text-heading")}>{title}</p>
        {description && (
          <p className={cn("text-fg-muted", kiosk ? "text-body" : "text-body-sm")}>{description}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      )}
    </div>
  );
}

/**
 * The camera area of a scanner: the live feed behind a corner frame while
 * streaming, and a calm panel for every other state (off, starting,
 * refused, missing, failed) with the one action that moves it forward.
 */
export function ScannerViewfinder({
  status,
  videoRef,
  flash = null,
  variant = "action",
  onStart,
  onStop,
  onRetry,
  onManualEntry,
  className,
}: ScannerViewfinderProps): ReactElement {
  const labels = useUiLabels();
  const kiosk = variant === "kiosk";
  const streaming = status === "active" || status === "starting";
  const buttonSize = kiosk ? "md" : "sm";
  const manual = onManualEntry && (
    <Button variant="secondary" size={buttonSize} icon={<Keyboard />} onClick={onManualEntry}>
      {labels.scannerManualEntry}
    </Button>
  );

  return (
    <div
      data-slot="scanner-viewfinder"
      data-status={status}
      className={cn(
        "relative isolate w-full overflow-hidden rounded-lg border border-border",
        "aspect-[4/3]",
        streaming && MEDIA_SURFACE,
        className,
      )}
    >
      {/* Mounted in every state, so the stream can attach before it shows. */}
      <video
        ref={videoRef}
        className={cn("absolute inset-0 size-full object-cover", !streaming && "invisible")}
        muted
        playsInline
        aria-hidden="true"
      />
      {streaming && (
        <div className={cn("absolute inset-0", ON_MEDIA)}>
          <AimingFrame flash={flash} />
          {status === "starting" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              <span className="text-label">{labels.scannerCameraStarting}</span>
            </div>
          ) : (
            <span
              className={cn(
                "absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 whitespace-nowrap",
                kiosk ? "text-label" : "text-caption",
                MEDIA_CHIP,
              )}
            >
              {labels.scannerCameraHint}
            </span>
          )}
          {onStop && (
            <button
              type="button"
              aria-label={labels.scannerCameraStop}
              onClick={onStop}
              className={cn(
                "absolute top-2 right-2 flex size-11 items-center justify-center rounded-full transition-opacity hover:opacity-90",
                MEDIA_CHIP,
              )}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {status === "idle" && (
        <Panel
          icon={<ScanLine />}
          tone="accent"
          title={labels.scannerCamera}
          description={labels.scannerCameraHint}
          kiosk={kiosk}
        >
          {onStart && (
            <Button size={buttonSize} icon={<Camera />} onClick={onStart}>
              {labels.scannerCameraStart}
            </Button>
          )}
        </Panel>
      )}
      {status === "denied" && (
        <Panel
          icon={<CameraOff />}
          tone="danger"
          title={labels.scannerCameraDeniedTitle}
          description={labels.scannerCameraDeniedDescription}
          kiosk={kiosk}
        >
          {onRetry && (
            <Button size={buttonSize} icon={<RotateCw />} onClick={onRetry}>
              {labels.scannerRetry}
            </Button>
          )}
          {manual}
        </Panel>
      )}
      {status === "unavailable" && (
        <Panel
          icon={<CameraOff />}
          tone="neutral"
          title={labels.scannerCameraUnavailableTitle}
          description={labels.scannerCameraUnavailableDescription}
          kiosk={kiosk}
        >
          {manual}
        </Panel>
      )}
      {status === "error" && (
        <Panel
          icon={<CameraOff />}
          tone="danger"
          title={labels.scannerCameraErrorTitle}
          description={labels.scannerCameraErrorDescription}
          kiosk={kiosk}
        >
          {onRetry && (
            <Button size={buttonSize} icon={<RotateCw />} onClick={onRetry}>
              {labels.scannerRetry}
            </Button>
          )}
          {manual}
        </Panel>
      )}
    </div>
  );
}
