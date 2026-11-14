"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  List,
  ListRow,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import type { LibraryTitle } from "../api";
import { RESERVATION_STATUS_TONE, toneOf } from "../lib/status-tones";
import {
  type LibraryMyProfile,
  useCancelMyLibraryReservationMutation,
  useReserveMyLibraryTitleMutation,
} from "../me-api";

import { MyLibraryTitlePicker } from "./my-library-title-picker";

const CANCELLABLE = new Set(["waiting", "ready"]);

/** A member's own holds, each cancellable while it waits, and the form to place a new one. */
export function MyLibraryReservations({
  reservations,
  bookingEnabled,
}: {
  reservations: LibraryMyProfile["reservations"];
  bookingEnabled: boolean;
}): ReactElement {
  const t = useTranslations("app.library.me.reserve");
  const tMe = useTranslations("app.library.me");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [selected, setSelected] = useState<LibraryTitle | null>(null);
  const reserve = useReserveMyLibraryTitleMutation();
  const cancel = useCancelMyLibraryReservationMutation();

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("heading")}</CardTitle>
        {reservations.length === 0 && (
          <CardDescription>
            {bookingEnabled ? t("emptyBody") : t("emptyBodyDisabled")}
          </CardDescription>
        )}
      </CardHeader>

      {reservations.length > 0 && (
        <List>
          {reservations.map((reservation) => (
            <ListRow
              key={reservation.id}
              title={reservation.title_name ?? tMe("titleUnavailable")}
              meta={
                <Badge tone={toneOf(RESERVATION_STATUS_TONE, reservation.status)} size="sm">
                  {reservation.status === "waiting" && reservation.position
                    ? t("queuePosition", { position: reservation.position })
                    : t(`status.${reservation.status}`)}
                </Badge>
              }
              action={
                CANCELLABLE.has(reservation.status) ? (
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
  );
}
