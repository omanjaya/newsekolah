"use client";

import { Skeleton, cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { SchoolMark } from "../../../components/school-mark";
import { useTenant } from "../../../lib/tenant/tenant-provider";

import styles from "./auth-brand-panel.module.css";

/**
 * The school's identity on every sign-in page: its logo (or initials), its
 * name and, when branding has one, its tagline, on the school's accent.
 * One element serves both layouts, so the name is written once: a compact
 * band above the form on a phone and tablet, the left pane from 1024px,
 * where the identity sits a little above the middle and a quiet footnote
 * holds the bottom edge. No product copy: the people signing in already
 * know what the app is for.
 *
 * While branding loads, the mark and the name are skeletons of the same
 * size, so neither the platform name nor a layout jump shows first.
 */
export function AuthBrandPanel(): ReactElement {
  const { branding, displayName, isLoading } = useTenant();
  const t = useTranslations("auth.login");
  const tagline = isLoading ? undefined : branding?.tagline?.trim();

  return (
    <header
      className={cn(
        styles.surface,
        "relative isolate overflow-hidden",
        "px-5 pb-11 pt-[max(env(safe-area-inset-top),1.5rem)] sm:px-8",
        "lg:flex lg:min-h-dvh lg:flex-col lg:px-14 lg:pb-12 lg:pt-14 xl:px-16",
      )}
    >
      {/* Depth: a soft light that drifts very slowly (it stops under
          reduced motion), and on the wide pane a faint dot grid. */}
      <div
        aria-hidden="true"
        className={cn(
          styles.bloom,
          "auth-orb-a pointer-events-none absolute -left-40 -top-48 -z-10 size-[28rem] rounded-full lg:-left-32 lg:-top-32 lg:size-[34rem]",
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          styles.grain,
          "pointer-events-none absolute inset-0 -z-10 hidden opacity-10 lg:block",
        )}
      />

      <div className="flex min-w-0 animate-enter items-center gap-3 lg:my-auto lg:flex-col lg:items-start lg:gap-6 lg:pb-16">
        <SchoolMark
          surface="brand"
          size={40}
          className="lg:size-16 lg:rounded-lg lg:text-title-lg"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:max-w-md lg:gap-3">
          {isLoading ? (
            <Skeleton className="h-5 w-40 rounded-full bg-accent-fg/15 lg:h-8 lg:w-64" />
          ) : (
            <p className="text-heading [overflow-wrap:anywhere] lg:text-display">{displayName}</p>
          )}
          {tagline && (
            <p className="truncate text-body-sm text-accent-fg/80 lg:whitespace-normal lg:text-body">
              {tagline}
            </p>
          )}
        </div>
      </div>

      <p className="hidden text-caption text-accent-fg/70 lg:block">{t("panelFootnote")}</p>
    </header>
  );
}
