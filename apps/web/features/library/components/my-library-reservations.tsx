"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import type { LibraryTitle } from "../api";
import {
  type LibraryMyProfile,
  useCancelMyLibraryReservationMutation,
  useReserveMyLibraryTitleMutation,
} from "../me-api";

import { LibraryTitleName } from "./library-title-name";
import { MyLibraryTitlePicker } from "./my-library-title-picker";

const CANCELLABLE = new Set(["waiting", "ready"]);

/** A member's own reservation queue, plus the form to reserve a new title. */
export function MyLibraryReservations({
  reservations,
  bookingEnabled,
}: {
  reservations: LibraryMyProfile["reservations"];
  bookingEnabled: boolean;
}): ReactElement {
  const t = useTranslations("app.library.me.reserve");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [selected, setSelected] = useState<LibraryTitle | null>(null);
  const reserve = useReserveMyLibraryTitleMutation();
  const cancel = useCancelMyLibraryReservationMutation();

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[15px] font-semibold text-fg">{t("heading")}</h2>

      {reservations.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("emptyBody")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reservations.map((reservation) => (
            <li
              key={reservation.id}
              className="flex items-center justify-between gap-3 rounded-xs border border-border px-3 py-2 text-[13px]"
            >
              <div className="flex flex-col">
                <span className="font-medium text-fg">
                  <LibraryTitleName titleId={reservation.title_id} />
                </span>
                <span className="text-[12px] text-fg-muted">
                  {reservation.status === "waiting" && reservation.position
                    ? t("queuePosition", { position: reservation.position })
                    : t(`status.${reservation.status}`)}
                </span>
              </div>
              {CANCELLABLE.has(reservation.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-status-absent"
                  loading={cancel.isPending && cancel.variables === reservation.id}
                  onClick={() => {
                    cancel.mutate(reservation.id, {
                      onSuccess: () => toast.success(t("cancelled")),
                      onError: (error) =>
                        toast.error(
                          error instanceof ApiError
                            ? apiErrorMessage(error.code)
                            : apiErrorMessage("UNKNOWN"),
                        ),
                    });
                  }}
                >
                  {t("cancel")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {bookingEnabled ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-fg">{t("pickTitle")}</span>
            <MyLibraryTitlePicker onSelect={setSelected} />
          </div>
          {selected && (
            <span className="text-[13px] text-fg">
              {t("selectedTitle", { title: selected.title })}
            </span>
          )}
          <Button
            type="button"
            size="sm"
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
        </div>
      ) : (
        <p className="border-t border-border pt-4 text-[13px] text-fg-muted">
          {t("bookingDisabled")}
        </p>
      )}
    </div>
  );
}
