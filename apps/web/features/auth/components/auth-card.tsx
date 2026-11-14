"use client";

import { Card, IconCircle, type Tone } from "@newsekolah/ui";
import { useId, type ReactElement, type ReactNode } from "react";

export interface AuthCardStatus {
  tone: Tone;
  /** A Lucide icon element. */
  icon: ReactNode;
}

export interface AuthCardProps {
  /** The page's h1: what this screen is for, or what just happened. */
  title: string;
  description?: ReactNode;
  /**
   * For a state screen (a reset link sent, a link no longer valid): the
   * icon in a soft circle of its tone, above the title.
   */
  status?: AuthCardStatus;
  children?: ReactNode;
  /** Help under a hairline at the end: a way back, who to ask. */
  footer?: ReactNode;
}

/**
 * The one frame for the sign-in pages (sign in, forgot password, set a new
 * password, forced password change), so the title, its description and the
 * form sit at the same place and size on every one of them. From 1024px it
 * is a card on the page; below that the auth layout's sheet is the surface,
 * so the card lies flat in it. It fades and rises in once per page.
 */
export function AuthCard({
  title,
  description,
  status,
  children,
  footer,
}: AuthCardProps): ReactElement {
  const titleId = useId();
  return (
    <Card
      asChild
      className="animate-enter max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none"
    >
      <section aria-labelledby={titleId}>
        <div className="flex flex-col gap-6 lg:p-10">
          {status && (
            <IconCircle tone={status.tone} size="lg">
              {status.icon}
            </IconCircle>
          )}
          <div className="flex flex-col gap-2">
            <h1 id={titleId} className="text-display text-fg">
              {title}
            </h1>
            {description && <p className="text-body text-fg-muted">{description}</p>}
          </div>
          {children}
          {footer && (
            <div className="flex flex-col items-center gap-2 border-t border-line pt-5 text-center text-body-sm text-balance text-fg-muted">
              {footer}
            </div>
          )}
        </div>
      </section>
    </Card>
  );
}
