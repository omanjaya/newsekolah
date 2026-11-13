"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Where the camera is: not asked for yet, starting, streaming, or one of
 * three reasons it is not: the reader (or a policy) refused it, there is
 * no camera, or it failed (most often another app holds it).
 */
export type CameraStatus = "idle" | "starting" | "active" | "denied" | "unavailable" | "error";

/**
 * Whether a camera can be asked for at all. Only needs `getUserMedia`,
 * not `BarcodeDetector`: iOS Safari has the former but not the latter,
 * and the hook falls back to a JS decoder there.
 */
export function isCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * The browser's camera permission without prompting, where the
 * Permissions API knows it ("granted" lets a scanner start on its own);
 * "unknown" where it does not (Firefox, older Safari).
 */
export async function queryCameraPermission(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  try {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return "unknown";
    const status = await navigator.permissions.query({ name: "camera" });
    return status.state;
  } catch {
    return "unknown";
  }
}

function statusFromError(error: unknown): CameraStatus {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "unavailable";
  return "error";
}

function hasNativeBarcodeDetector(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

export interface UseCameraScannerOptions {
  /** Streams while true; turning it false stops the camera and its light. */
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Keep reading after a code; otherwise the first code stops detection. */
  continuous: boolean;
  /** Every code read, in order; the hook does not filter duplicates. */
  onDetect: (code: string) => void;
}

/**
 * Streams the rear camera into `videoRef` and reports every code it reads.
 * Detection prefers the native `BarcodeDetector` (zero extra bytes,
 * fastest). iOS Safari never has it, so there the decoder lazily imports
 * `@zxing/browser` (QR plus the Code 128/EAN barcodes the library desk
 * scans), and pages that never open the camera never load it. The stream
 * is always stopped on unmount or when `enabled` turns false, so a
 * background tab never keeps the camera light on.
 */
export function useCameraScanner({
  enabled,
  videoRef,
  continuous,
  onDetect,
}: UseCameraScannerOptions): { status: CameraStatus; retry: () => void } {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  // The effect subscribes once per start (re-subscribing would restart the
  // camera), so it reads the latest callback through a ref.
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  const supported = isCameraSupported();
  useEffect(() => {
    if (!enabled || !supported) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let fallbackControls: { stop: () => void } | null = null;
    // The status mirrors the camera, an external system: a new start
    // resets it before the browser answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setStatus("starting");

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
              onDetectRef.current(first.rawValue);
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
      // decodeFromStream binds the stream to the video element itself and
      // keeps calling back until controls.stop(): no rAF loop of our own.
      fallbackControls = await reader.decodeFromStream(mediaStream, videoRef.current, (result) => {
        if (result && !stopped) {
          if (!continuous) stopped = true;
          onDetectRef.current(result.getText());
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
        setStatus("active");
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
      .catch((error: unknown) => {
        if (stopped) return;
        stopped = true;
        setStatus(statusFromError(error));
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      fallbackControls?.stop();
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [enabled, supported, continuous, videoRef, attempt]);

  let current: CameraStatus = status;
  if (!enabled) current = "idle";
  else if (!supported) current = "unavailable";
  return {
    status: current,
    retry: () => {
      setAttempt((count) => count + 1);
    },
  };
}
