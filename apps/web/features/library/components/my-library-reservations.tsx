"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Button,
  Card,
  EmptyState,
  Field,
  List,
  ListRow,
  SectionHeader,
  useToast,
} from "@newsekolah/ui";
import { BookmarkPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { businessNow } from "../../../lib/simulation/clock";
import type { LibraryTitle } from "../api";
import { shownReservationStatus } from "../lib/reservation-pickup";
import {
  type LibraryMyProfile,
  useCancelMyLibraryReservationMutation,
  useReserveMyLibraryTitleMutation,
} from "../me-api";

import { MyLibraryTitlePicker } from "./my-library-title-picker";
import { ReservationStatus } from "./reservation-status";

const CANCELLABLE = new Set(["waiting", "ready"]);

/**
 * A member's own holds, each cancellable while it waits, and the form to
 * place a new one. Titled above its card like the page's other sections.
 * A ready hold says until when it can be collected; once that has passed
 * it reads expired and can no longer be cancelled.
 */
export function MyLibraryReservations({
  reservations,
  bookingEnabled,
  locale,
  timeZone,
  today,
}: {
  reservations: LibraryMyProfile["reservations"];
  bookingEnabled: boolean;
  locale: Locale;
  timeZone: string | undefined;
  today?: string;
}): ReactElement {
  const t = useTranslations("app.library.me.reserve");
  const tMe = useTranslations("app.library.me");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [selected, setSelected] = useState<LibraryTitle | null>(null);
  const reserve = useReserveMyLibraryTitleMutation();
  const cancel = useCancelMyLibraryReservationMutation();
  const now = businessNow();

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t("heading")} />
      <Card>
        {reservations.length === 0 ? (
          <EmptyState
            icon={<BookmarkPlus aria-hidden="true" />}
            title={t("emptyTitle")}
            description={bookingEnabled ? t("emptyBody") : undefined}
          />
        ) : (
          <List aria-label={t("heading")}>
            {reservations.map((reservation) => (
              <ListRow
                key={reservation.id}
                title={reservation.title_name ?? tMe("titleUnavailable")}
                meta={
                  <ReservationStatus
                    reservation={reservation}
                    now={now}
                    locale={locale}
                    timeZone={timeZone}
                    today={today}
                    size="sm"
                  />
                }
                action={
                  CANCELLABLE.has(shownReservationStatus(reservation, now)) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={cancel.isPending && cancel.variables === reservation.id}
                      onClick={() => {
                        cancel.mutate(reservation.id, {
                          onSuccess: () => {
                            toast.success(t("cancelled"));
                          },
                          onError: (error) => {
                            toast.error(
                              error instanceof ApiError
                                ? apiErrorMessage(error.code)
                                : apiErrorMessage("UNKNOWN"),
                            );
                          },
                        });
                      }}
                    >
                      {t("cancel")}
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </List>
        )}

        <div className="flex flex-col gap-3 border-t border-line p-5">
          {bookingEnabled ? (
            <>
              <Field
                label={t("pickTitle")}
                hint={selected ? t("selectedTitle", { title: selected.title }) : undefined}
              >
                <MyLibraryTitlePicker selected={selected} onSelect={setSelected} />
              </Field>
              <Button
                className="self-end max-sm:w-full"
                loading={reserve.isPending}
                disabled={!selected}
                onClick={() => {
                  if (!selected) return;
                  reserve.mutate(selected.id, {
                    onSuccess: () => {
                      toast.success(t("reserved"));
                      setSelected(null);
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  });
                }}
              >
                {t("submit")}
              </Button>
            </>
          ) : (
            <p className="text-body-sm text-fg-muted">{t("bookingDisabled")}</p>
          )}
        </div>
      </Card>
    </section>
  );
}
