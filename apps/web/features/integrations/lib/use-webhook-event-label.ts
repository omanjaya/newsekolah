"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * The reader's name for a webhook event code (`app.integrations.events`,
 * nested by the code's dot: `leave_request.issued` reads
 * `events.leave_request.issued`). The code itself stays the integrator's
 * identifier and is shown beside the name; a code the catalog does not name
 * yet falls back to the code. Stable per locale, so table columns built
 * from it are not rebuilt on every render.
 */
export function useWebhookEventLabel(): (eventType: string) => string {
  const t = useTranslations("app.integrations.events");
  return useCallback((eventType: string) => (t.has(eventType) ? t(eventType) : eventType), [t]);
}
