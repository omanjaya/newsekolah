"use client";

import { Slot } from "@radix-ui/react-slot";
import { ArrowUpRight } from "lucide-react";
import { forwardRef, type AnchorHTMLAttributes } from "react";

import { cn } from "../utils/cn.js";

import { useUiLabels } from "./ui-labels.js";
import { UiLink } from "./ui-link.js";

export type TextLinkVariant = "standalone" | "inline";
export type TextLinkTone = "accent" | "muted";

const VARIANT_CLASS: Record<TextLinkVariant, string> = {
  // "Lihat semua": the label role, underlined on hover only. On a touch
  // screen an invisible margin widens the target to 44px.
  standalone:
    "relative text-label hover:underline pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3 pointer-coarse:after:content-['']",
  // Inside running text: the surrounding size and weight, always underlined,
  // so the link is not told apart by colour alone.
  inline: "font-semibold underline",
};

const TONE_CLASS: Record<TextLinkTone, string> = {
  accent: "text-accent hover:text-accent-strong",
  muted: "text-fg-muted hover:text-fg",
};

interface TextLinkBaseProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  /** `standalone` (default) for a link on its own line or beside a title; `inline` inside a sentence. */
  variant?: TextLinkVariant;
  /** `accent` (default), or `muted` for a quiet secondary link. */
  tone?: TextLinkTone;
  /** Opens in a new tab, with an arrow and a spoken note saying so. */
  external?: boolean;
}

export type TextLinkProps = TextLinkBaseProps &
  (
    | { href: string; asChild?: false }
    /** Styles the single child instead (a `Link`, or a `button` that navigates). */
    | { asChild: true; href?: undefined }
  );

/**
 * The one text link: accent, 600, an underline on hover (or always, inline),
 * the global focus ring. Internal links render through UiLinkProvider's
 * component, so they navigate on the client.
 */
export const TextLink = forwardRef<HTMLAnchorElement, TextLinkProps>(function TextLink(
  {
    variant = "standalone",
    tone = "accent",
    external = false,
    asChild,
    className,
    children,
    href,
    ...props
  },
  ref,
) {
  const labels = useUiLabels();
  const classes = cn(
    "rounded-xs decoration-1 underline-offset-[0.2em] transition-colors",
    VARIANT_CLASS[variant],
    TONE_CLASS[tone],
    external && "inline-flex items-center gap-0.5",
    className,
  );
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  if (external) {
    return (
      <a ref={ref} href={href} target="_blank" rel="noreferrer" className={classes} {...props}>
        {children}
        <ArrowUpRight className="size-[1em] shrink-0" aria-hidden="true" />
        <span className="sr-only"> {labels.linkOpensInNewTab}</span>
      </a>
    );
  }
  return (
    <UiLink ref={ref} href={href} className={classes} {...props}>
      {children}
    </UiLink>
  );
});
