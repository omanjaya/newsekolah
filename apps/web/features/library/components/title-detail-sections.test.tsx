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
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "m1", name: "Ani" }]);
});

const hold = (id: string, requestedAt: string) => ({
  id,
  member_user_id: "m1",
  status: "waiting",
  position: 1,
  requested_at: requestedAt,
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
});
