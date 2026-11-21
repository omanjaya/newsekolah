import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import type { ScheduleHold } from "../api";

import { EffectiveFromHint } from "./effective-from-hint";

function renderIn(locale: "id" | "en", ui: ReactElement) {
  const messages = locale === "id" ? id : en;
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ app: { schedule: messages.app.schedule } }}
      timeZone="Asia/Makassar"
      onError={(error) => {
        throw error;
      }}
    >
      <p>{ui}</p>
    </NextIntlClientProvider>,
  );
}

const request: ScheduleHold = {
  kind: "substitution",
  id: "request-1",
  date: "2027-03-01",
  status: "pending",
};

describe("EffectiveFromHint", () => {
  it("names the pending request that holds the date, and where to cancel it", () => {
    const { container } = renderIn("id", <EffectiveFromHint min="2027-03-02" hold={request} />);
    expect(container).toHaveTextContent(
      "Paling cepat Selasa, 2 Maret 2027. Ditahan oleh permintaan guru pengganti untuk Senin, 1 Maret 2027 (menunggu jawaban).",
    );
    expect(screen.getByRole("link", { name: "Lihat permintaan" })).toHaveAttribute(
      "href",
      "/substitutions?view=all",
    );
  });

  it("says an accepted substitution holds it too", () => {
    const { container } = renderIn(
      "en",
      <EffectiveFromHint min="2027-03-02" hold={{ ...request, status: "accepted" }} />,
    );
    expect(container).toHaveTextContent(
      "Earliest Tuesday, March 2, 2027. Held by an accepted substitution on Monday, March 1, 2027.",
    );
  });

  it("names a recorded session and a supervision visit, which cannot be released", () => {
    const { container, unmount } = renderIn(
      "id",
      <EffectiveFromHint
        min="2027-02-14"
        hold={{ kind: "attendance", id: "session-1", date: "2027-02-13" }}
      />,
    );
    expect(container).toHaveTextContent(
      "Ditahan oleh presensi yang sudah tercatat pada Sabtu, 13 Februari 2027.",
    );
    expect(screen.getByRole("link", { name: "Buka presensi" })).toHaveAttribute(
      "href",
      "/attendance/session-1",
    );
    unmount();

    renderIn(
      "id",
      <EffectiveFromHint
        min="2026-09-29"
        hold={{ kind: "supervision", id: "visit-1", date: "2026-09-28" }}
      />,
    );
    expect(
      screen.getByText(
        /Ditahan oleh kunjungan supervisi yang dijadwalkan pada Senin, 28 September 2026/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says only the earliest date when nothing holds it", () => {
    const { container } = renderIn("id", <EffectiveFromHint min="2026-11-21" />);
    expect(container).toHaveTextContent(/^Paling cepat Sabtu, 21 November 2026\.$/);
  });
});
