import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HomeroomQueueCard } from "./homeroom-queue-card";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

describe("HomeroomQueueCard", () => {
  it("says its read failed instead of the all-clear, without a count", () => {
    const retry = vi.fn();
    render(
      <HomeroomQueueCard
        title="Izin menunggu"
        count={0}
        loading={false}
        failure={{ error: new Error("500"), retry }}
        empty="Tidak ada izin"
      >
        {null}
      </HomeroomQueueCard>,
    );

    expect(screen.queryByText("Tidak ada izin")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "actions.retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows the all-clear line with a success check when nothing is listed", () => {
    const { container } = render(
      <HomeroomQueueCard title="Izin menunggu" count={0} loading={false} empty="Tidak ada izin">
        {null}
      </HomeroomQueueCard>,
    );

    expect(screen.getByText("Tidak ada izin")).toBeInTheDocument();
    // The same check icon as on Ringkasan, whichever tab the card is on.
    expect(container.querySelector("svg.lucide-circle-check")).not.toBeNull();
  });

  it("uses the accent count for work waiting on the teacher and neutral for a tally", () => {
    const { rerender } = render(
      <HomeroomQueueCard
        title="Perlu dihubungi"
        count={2}
        countTone="accent"
        loading={false}
        empty=""
      >
        <li>row</li>
      </HomeroomQueueCard>,
    );
    expect(screen.getByText("2")).toHaveClass("bg-accent");

    rerender(
      <HomeroomQueueCard title="Catatan pelanggaran" count={3} loading={false} empty="">
        <li>row</li>
      </HomeroomQueueCard>,
    );
    expect(screen.getByText("3")).toHaveClass("bg-neutral-soft");
  });
});
