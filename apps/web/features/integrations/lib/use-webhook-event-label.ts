"use client";

import { useTranslations } from "next-intl";

/**
 * The reader's name for a webhook event code (`app.integrations.events`,
 * nested by the code's dot: `leave_request.issued` reads
 * `events.leave_request.issued`). The code itself stays the integrator's
 * identifier and is shown beside the name; a code the catalog does not name
 * yet falls back to the code.
 */
export function useWebhookEventLabel(): (eventType: string) => string {
  const t = useTranslations("app.integrations.events");
  return (eventType) => (t.has(eventType) ? t(eventType) : eventType);
}
