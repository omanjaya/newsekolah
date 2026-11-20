"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import { HeroCard } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useBusinessNow } from "../../../lib/simulation/clock";
import type { ExitPermitDetail } from "../api";
import { type ExitReturnState, exitReturnState } from "../lib/exit-return";

/**
 * The card once the student is through the gate: when they left and, when
 * a return is expected, when they are due back, turning danger once that
 * has passed; after security records them back, when they came back and
 * whether it was late.
 */
export function ExitedCard({
  destination,
  exitedAt,
  state,
}: {
  destination: string;
  exitedAt: string;
  state: ExitReturnState;
}): ReactElement {
  const t = useTranslations("app.permits.exit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const exited = t("hero.exitedAt", { time: exitedAt });

  if (state.kind === "out") {
    const due = formatTime(state.due, { locale, timeZone });
    const late = state.lateMinutes > 0;
    return (
      <HeroCard
        tone={late ? "danger" : "accent-soft"}
        eyebrow={t("hero.exitedEyebrow")}
        chip={late ? t("lateBy", { minutes: state.lateMinutes }) : t("hero.notBackChip")}
        live={!late}
        title={destination}
        meta={[exited, t(late ? "hero.wasDueBack" : "hero.dueBack", { time: due })].join(" · ")}
      />
    );
  }
  if (state.kind === "returned") {
    const lateMinutes = state.lateMinutes ?? 0;
    const late = lateMinutes > 0;
    const back = formatTime(state.at, { locale, timeZone });
    // No verdict chip without a due time to judge the return by.
    const chip =
      state.lateMinutes === null
        ? undefined
        : late
          ? t("lateBy", { minutes: lateMinutes })
          : t("onTime");
    return (
      <HeroCard
        tone={late ? "warning" : "neutral"}
        eyebrow={t("hero.returnedEyebrow")}
        chip={chip}
        title={destination}
        meta={[exited, t("hero.returnedAt", { time: back })].join(" · ")}
      />
    );
  }
  return (
    <HeroCard tone="neutral" eyebrow={t("hero.exitedEyebrow")} title={destination} meta={exited} />
  );
}

/**
 * The return line of a permit's detail, or null before the gate and for a
 * permit that exited before returns were tracked (nothing is known).
 */
export function useReturnText(data: ExitPermitDetail | undefined): string | null {
  const t = useTranslations("app.permits.exit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const now = useBusinessNow();
  if (!data?.exited_at) return null;
  if (!data.return_required) return t("noReturn");
  const state = exitReturnState(data, now);
  const timeZone = me?.tenant.timezone;
  if (state.kind === "returned") {
    const at = formatTime(state.at, { locale, timeZone });
    if (state.lateMinutes === null) return t("hero.returnedAt", { time: at });
    return state.lateMinutes > 0
      ? t("returnedLate", { time: at, minutes: state.lateMinutes })
      : t("returnedOnTime", { time: at });
  }
  if (state.kind === "out") {
    const due = formatTime(state.due, { locale, timeZone });
    return state.lateMinutes > 0
      ? t("notBackLate", { time: due, minutes: state.lateMinutes })
      : t("notBack", { time: due });
  }
  return null;
}
