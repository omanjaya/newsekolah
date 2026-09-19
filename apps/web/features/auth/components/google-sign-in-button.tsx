"use client";

import { ApiError } from "@newsekolah/api-client";
import Script from "next/script";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useGoogleLoginMutation } from "../api";

interface GoogleCredentialResponse {
  credential: string;
}

/**
 * The slice of Google Identity Services' global `window.google` object
 * this component uses. GIS has no published npm types, so this is
 * declared narrowly here rather than pulling in an untyped dependency.
 */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }): void;
          renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

/**
 * Renders Google's own "Sign in with Google" button once the Identity
 * Services script has loaded, and exchanges the credential it produces
 * for a session via `POST /v1/auth/sso/google`. Shown by the login screen
 * only when `GET /v1/auth/sso/google` reports the tenant has it enabled.
 */
export function GoogleSignInButton({
  clientId,
  locale,
  onSuccess,
  onError,
}: {
  clientId: string;
  locale: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}): ReactElement {
  const t = useTranslations("auth.login");
  const apiErrorMessage = useApiErrorMessage();
  const googleLogin = useGoogleLoginMutation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  // Google's button takes a fixed pixel width (it does not fill its
  // container), so it is measured from the card it renders into rather
  // than hardcoded -- the auth card is narrower than 320px on a phone.
  const [width, setWidth] = useState(320);

  useEffect(() => {
    // Coalesce resize events through rAF (one measurement per frame) and
    // skip the setState when the computed width has not actually changed,
    // so dragging the window does not re-render this on every event.
    let frame: number | null = null;
    function measure() {
      frame = null;
      const available = containerRef.current?.parentElement?.getBoundingClientRect().width;
      if (!available) return;
      const next = Math.min(320, Math.max(200, Math.floor(available)));
      setWidth((prev) => (prev === next ? prev : next));
    }
    function scheduleMeasure() {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    }
    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        googleLogin.mutate(response.credential, {
          onSuccess,
          onError: (error) => {
            onError(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      },
    });
    containerRef.current.replaceChildren();
    window.google.accounts.id.renderButton(containerRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      width,
      text: "signin_with",
      locale,
    });
    // googleLogin, onSuccess, and onError are recreated every render (the
    // mutation object and inline callbacks from the parent); re-running
    // this effect for those would just re-render the same button, so only
    // the values that change what Google actually renders are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, clientId, locale, width]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          setScriptLoaded(true);
        }}
      />
      <div ref={containerRef} role="group" aria-label={t("googleButton")} />
    </>
  );
}
