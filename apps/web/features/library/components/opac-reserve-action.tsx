"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, CardFooter, TextLink, useToast } from "@newsekolah/ui";
import { BookmarkPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { signInPath } from "../../../lib/session/sign-in-path";
import { useMyLibraryProfileQuery, useReserveMyLibraryTitleMutation } from "../me-api";

const OPEN_RESERVATION = new Set(["waiting", "ready"]);

/**
 * What a reader can do about a title with no copy on the shelf: a signed-in
 * member reserves it right here (or sees the reservation they already
 * have), anyone else is pointed at their library page or at signing in.
 * Reserving used to be reachable only from /library/me, which the
 * catalogue never mentioned.
 */
export function OpacReserveAction({ titleId }: { titleId: string }): ReactElement | null {
  const t = useTranslations("app.library.opac.detail.reserve");
  const { status, isReady } = useSession();
  const canReserve = useCan("view_own_library_loans");
  const signedIn = status === "authenticated";
  const profile = useMyLibraryProfileQuery(signedIn && canReserve);
  const reserve = useReserveMyLibraryTitleMutation();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  if (!isReady) return null;
  if (!signedIn) {
    return (
      <CardFooter className="flex-col items-start">
        <p className="text-body-sm text-fg-muted">
          <TextLink href={signInPath(`/opac/${titleId}`)}>{t("signIn")}</TextLink>
        </p>
      </CardFooter>
    );
  }

  const myLibraryLink = <TextLink href="/library/me">{t("myLibrary")}</TextLink>;
  const data = profile.data;
  if (!canReserve || profile.isError || (data && (!data.member || !data.booking_enabled))) {
    return (
      <CardFooter className="flex-col items-start">
        <p className="text-body-sm text-fg-muted">{myLibraryLink}</p>
      </CardFooter>
    );
  }
  if (!data) return null;

  const existing = data.reservations.find(
    (reservation) => reservation.title_id === titleId && OPEN_RESERVATION.has(reservation.status),
  );
  if (existing) {
    return (
      <CardFooter className="flex-col items-start">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-fg">
          <span>
            {existing.status === "ready"
              ? t("ready")
              : existing.position
                ? t("queued", { position: existing.position })
                : t("waiting")}
          </span>
          {myLibraryLink}
        </p>
      </CardFooter>
    );
  }

  return (
    <CardFooter className="flex-col items-start">
      <p className="text-body-sm text-fg-muted">{t("hint")}</p>
      <Button
        icon={<BookmarkPlus />}
        loading={reserve.isPending}
        onClick={() => {
          reserve.mutate(titleId, {
            onSuccess: () => {
              toast.success(t("done"));
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
        {t("action")}
      </Button>
    </CardFooter>
  );
}
