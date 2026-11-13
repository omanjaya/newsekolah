import type { FeatureModule } from "../../../lib/modules/feature-modules";

/**
 * The feature module that publishes each webhook event, by the event name's
 * domain prefix (apps/api/internal/platform/events/names.go). Events of
 * always-on modules (attendance, substitution) are absent.
 */
const EVENT_PREFIX_MODULE: readonly (readonly [string, FeatureModule])[] = [
  ["leave_request.", "permits"],
  ["exit_permit.", "permits"],
  ["late_arrival.", "permits"],
  ["warning_letter.", "discipline"],
  ["announcement.", "announcements"],
];

export function webhookEventModule(eventType: string): FeatureModule | undefined {
  return EVENT_PREFIX_MODULE.find(([prefix]) => eventType.startsWith(prefix))?.[1];
}

/**
 * The event types an endpoint can be subscribed to: a switched-off module
 * publishes nothing, so its events are not offered. An endpoint already
 * subscribed to one keeps that subscription (the form saves its full
 * selection), and it fires again once the module is back on.
 */
export function offeredWebhookEvents(
  eventTypes: readonly string[],
  isEnabled: (module: FeatureModule) => boolean,
): string[] {
  return eventTypes.filter((eventType) => {
    const module = webhookEventModule(eventType);
    return !module || isEnabled(module);
  });
}
