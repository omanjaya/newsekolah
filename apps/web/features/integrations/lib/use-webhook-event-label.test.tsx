import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import integrationsEn from "../../../messages/features/integrations.en.json";
import integrationsId from "../../../messages/features/integrations.id.json";

import { useWebhookEventLabel } from "./use-webhook-event-label";

/** Every event name apps/api/internal/platform/events/names.go publishes. */
const EVENT_TYPES = [
  "attendance.submitted",
  "substitution.requested",
  "substitution.responded",
  "leave_request.submitted",
  "leave_request.reviewed",
  "leave_request.issued",
  "exit_permit.stage_changed",
  "exit_permit.issued",
  "exit_permit.exited",
  "late_arrival.opened",
  "late_arrival.updated",
  "warning_letter.issued",
  "discipline.threshold_reached",
  "announcement.published",
  "library.reservation_ready",
  "library.loan_due_reminder",
];

function Labels({ codes }: { codes: readonly string[] }): ReactElement {
  const label = useWebhookEventLabel();
  return (
    <ul>
      {codes.map((code) => (
        <li key={code} data-code={code}>
          {label(code)}
        </li>
      ))}
    </ul>
  );
}

describe.each([
  ["id", integrationsId],
  ["en", integrationsEn],
])("useWebhookEventLabel (%s)", (locale, integrations) => {
  function renderLabels(codes: readonly string[]) {
    return render(
      <NextIntlClientProvider
        locale={locale}
        messages={{ app: { integrations } }}
        onError={() => undefined}
      >
        <Labels codes={codes} />
      </NextIntlClientProvider>,
    );
  }

  it("names every event the API publishes instead of showing its code", () => {
    renderLabels(EVENT_TYPES);
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.textContent).not.toBe(item.dataset.code);
      expect(item.textContent).not.toBe("");
    }
  });

  it("falls back to the code for an event the catalog does not name yet", () => {
    renderLabels(["future.event"]);
    expect(screen.getByRole("listitem")).toHaveTextContent("future.event");
  });
});
