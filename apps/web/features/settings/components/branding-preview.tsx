"use client";

import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  useMediaQuery,
} from "@newsekolah/ui";
import { House, Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactElement } from "react";

import { ROW, ROW_ACTIVE, ROW_IDLE_TOP } from "../../../components/sidebar-nav";
import { resolveTenantAccents } from "../../../lib/tenant/accent";
import { initialsFor } from "../../../lib/tenant/initials";
import { useTheme } from "../../../lib/theme/theme-provider";

export interface BrandingPreviewProps {
  name: string;
  shortName: string;
  tagline: string;
  /** The accent as typed; an unfinished hex falls back to the platform's. */
  accent: string;
  logoUrl?: string;
  faviconUrl?: string;
  /**
   * Without the card, its title and description, for a container that
   * already names the preview (the phone's PreviewSheet).
   */
  bare?: boolean;
}

/**
 * The preview reuses the sidebar's own row styles, so the menu looks as the
 * app draws it. The active row is the system's accent-soft, which a school's
 * colour does not repaint (docs/07-ui-ux.md): the preview must not suggest it
 * does. Only the icon gap and inset are the preview's own.
 */
const PREVIEW_ROW_LAYOUT = "gap-2.5 px-2.5";

function Mark({
  name,
  logoUrl,
  size,
  onBrand = false,
}: {
  name: string;
  logoUrl?: string;
  size: "tab" | "md";
  /** On the accent surface of the sign-in panel: a light plate, as SchoolMark draws it there. */
  onBrand?: boolean;
}): ReactElement {
  if (size === "tab") {
    // A favicon is 16px: the generated icon is the accent square with the
    // initials, too small to letter here.
    return <span aria-hidden="true" className="size-4 shrink-0 rounded-xs bg-accent" />;
  }
  if (logoUrl) {
    // A tenant-supplied external URL, as in SchoolMark.
    return (
      <img
        src={logoUrl}
        alt=""
        className={cn(
          "size-10 shrink-0 rounded-md object-contain",
          onBrand ? "bg-accent-fg p-1 shadow-1" : "bg-surface",
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-md text-body font-heading font-bold leading-none select-none",
        onBrand
          ? "bg-accent-fg/12 text-accent-fg ring-1 ring-accent-fg/25 ring-inset"
          : "bg-accent text-accent-fg",
      )}
    >
      {initialsFor(name)}
    </span>
  );
}

/**
 * How the unsaved branding will look: the browser tab, the app's brand
 * row with an active menu item, a primary button, a link and a badge, and
 * the sign-in panel. It paints the accent the app would derive from the
 * typed colour (lib/tenant/accent.ts), in the theme the reader is using,
 * and lists both theme variants with a note when one was adjusted to stay
 * readable.
 */
export function BrandingPreview({
  name,
  shortName,
  tagline,
  accent,
  logoUrl,
  faviconUrl,
  bare = false,
}: BrandingPreviewProps): ReactElement {
  const t = useTranslations("app.settings.branding.preview");
  const { theme } = useTheme();
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  const accents = resolveTenantAccents(accent);
  const displayName = name.trim() || t("namePlaceholder");
  const tabName = shortName.trim() || displayName;
  const adjusted =
    accent.toUpperCase() !== accents.light.toUpperCase() ||
    accent.toUpperCase() !== accents.dark.toUpperCase();

  // The school's colour, as the app would paint it in this theme. Data,
  // not a style choice: it is whatever the school typed.
  const paint = {
    "--color-accent": dark ? accents.dark : accents.light,
    "--color-accent-fg": dark ? accents.darkFg : accents.lightFg,
    "--color-accent-strong": dark ? accents.darkStrong : accents.lightStrong,
    "--color-focus-ring": dark ? accents.dark : accents.light,
  } as CSSProperties;
  const signInPaint = {
    "--color-accent": accents.light,
    "--color-accent-fg": accents.lightFg,
  } as CSSProperties;

  const body = (
    <div className={cn("flex flex-col gap-5", !bare && "px-5 pb-5")} style={paint}>
      <figure className="flex flex-col gap-2">
        <figcaption className="text-caption text-fg-muted">{t("browserTab")}</figcaption>
        <div className="rounded-md bg-surface-sunken p-1.5 pb-0">
          <div className="flex max-w-60 items-center gap-2 rounded-t-sm bg-surface px-3 py-2">
            {faviconUrl ? (
              <img src={faviconUrl} alt="" className="size-4 shrink-0 object-contain" />
            ) : (
              <Mark name={displayName} size="tab" />
            )}
            <span className="truncate text-caption text-fg">
              {t("tabTitle", { page: t("homePage"), school: tabName })}
            </span>
          </div>
        </div>
      </figure>

      <figure className="flex flex-col gap-2">
        <figcaption className="text-caption text-fg-muted">{t("app")}</figcaption>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3">
          <div className="flex items-center gap-2.5">
            <Mark name={displayName} logoUrl={logoUrl} size="md" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-label text-fg">{displayName}</span>
              {tagline.trim() && (
                <span className="truncate text-caption text-fg-muted">{tagline.trim()}</span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className={cn(ROW, PREVIEW_ROW_LAYOUT, ROW_ACTIVE)}>
              <House className="size-4" aria-hidden="true" />
              {t("homePage")}
            </span>
            <span className={cn(ROW, PREVIEW_ROW_LAYOUT, ROW_IDLE_TOP)}>
              <Megaphone className="size-4" aria-hidden="true" />
              {t("announcements")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <Button tabIndex={-1} aria-hidden="true">
              {t("primaryButton")}
            </Button>
            <span className="text-label text-accent underline-offset-2">{t("link")}</span>
            <Badge tone="accent">{t("badge")}</Badge>
          </div>
        </div>
      </figure>

      <figure className="flex flex-col gap-2" style={signInPaint}>
        <figcaption className="text-caption text-fg-muted">{t("signIn")}</figcaption>
        <div className="flex items-center gap-3 rounded-md bg-accent p-4 text-accent-fg">
          <Mark name={displayName} logoUrl={logoUrl} size="md" onBrand />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-heading">{displayName}</span>
            {tagline.trim() && (
              <span className="truncate text-body-sm opacity-90">{tagline.trim()}</span>
            )}
          </span>
        </div>
      </figure>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-caption text-fg-muted">{t("variants")}</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["light", accents.light],
              ["dark", accents.dark],
            ] as const
          ).map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-caption text-fg"
            >
              <span
                aria-hidden="true"
                className="size-3.5 rounded-full border border-border bg-(--swatch)"
                style={{ "--swatch": value } as CSSProperties}
              />
              {t(key)} <span className="font-mono text-fg-muted">{value.toUpperCase()}</span>
            </span>
          ))}
        </div>
        {adjusted && <p className="text-body-sm text-fg-muted">{t("adjusted")}</p>}
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <Card aria-label={t("title")}>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      {body}
    </Card>
  );
}
