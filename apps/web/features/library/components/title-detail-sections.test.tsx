import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReservationQueue } from "./title-detail-sections";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.date ? `${key} ${values.date}` : key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/tenant-date", () => ({ todayInZone: () => "2026-11-19" }));
// Thu 19 Nov 2026 16:00 WITA.
vi.mock("../../../lib/simulation/clock", () => ({
  businessNow: () => new Date("2026-11-19T08:00:00Z"),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "m1", name: "Ani" }]);
});

const hold = (id: string, requestedAt: string) => ({
  id,
  member_user_id: "m1",
  status: "waiting" as const,
  position: 1,
  requested_at: requestedAt,
});

const readyHold = (id: string, expiresAt: string) => ({
  id,
  member_user_id: "m1",
  status: "ready" as const,
  requested_at: "2026-11-10T01:00:00Z",
  expires_at: expiresAt,
});

describe("ReservationQueue", () => {
  it("dates each hold like the rest of the library: the school's day, the year outside this one", () => {
    render(
      <ReservationQueue
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        reservations={[
          // 17:30 UTC on 18 Nov is already 19 Nov in Asia/Makassar (UTC+8).
          hold("r1", "2026-11-18T17:30:00Z"),
          hold("r2", "2025-10-06T03:00:00Z"),
        ]}
      />,
    );

    expect(screen.getByText("requestedOn 19 Nov")).toBeInTheDocument();
    expect(screen.getByText("requestedOn 6 Okt 2025")).toBeInTheDocument();
  });

  // The title's queue said a bare "Siap diambil" while the member's page
  // named the deadline, and kept saying it after the deadline had passed.
  it("names a ready hold's pickup deadline, and reads a lapsed one as expired", () => {
    const { container } = render(
      <ReservationQueue
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        reservations={[
          readyHold("r3", "2026-11-23T15:59:59Z"),
          readyHold("r4", "2026-11-18T15:59:59Z"),
        ]}
      />,
    );

    const [kept, lapsed] = container.querySelectorAll("li");
    if (!kept || !lapsed) throw new Error("expected two rows");
    expect(kept).toHaveTextContent("pickupBy 23 Nov");
    expect(kept.querySelector('[data-slot="list-row-trailing"]')).toHaveTextContent(
      /^status\.ready$/,
    );
    expect(lapsed).toHaveTextContent("pickupPassed 18 Nov");
    expect(lapsed.querySelector('[data-slot="list-row-trailing"]')).toHaveTextContent(
      /^status\.expired$/,
    );
  });
});
