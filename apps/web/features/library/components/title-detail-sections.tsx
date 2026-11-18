"use client";

import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  DataList,
  DataListItem,
  EmptyState,
  List,
  ListRow,
  SkeletonDetail,
  domainIcons,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useDirectoryNames } from "../../reference/directory-names";
import type { LibraryTitle } from "../api";
import { RESERVATION_STATUS_TONE, toneOf } from "../lib/status-tones";

import { OpacCover } from "./opac-cover";

/** The book at a glance: cover, author, publication and how many copies are in now. */
export function TitleIdentity({ title }: { title: LibraryTitle }): ReactElement {
  const t = useTranslations("app.library.titleDetail");
  const publication = [title.publisher, title.publish_place, title.publish_year]
    .filter(Boolean)
    .join(", ");
  return (
    <Card padding="md" className="flex-row items-start gap-5">
      <OpacCover title={title.title} size="lg" />
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {title.author && <p className="text-heading text-fg">{title.author}</p>}
          {publication && <p className="text-body-sm text-fg-muted">{publication}</p>}
          {(title.classification || title.isbn) && (
            <p className="text-body-sm text-fg-muted tabular-nums">
              {[title.classification, title.isbn && `ISBN ${title.isbn}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {title.total_copies === 0 ? (
            <Badge tone="neutral">{t("noCopies")}</Badge>
          ) : title.available_copies > 0 ? (
            <Badge tone="success" dot>
              {t("availability", {
                available: title.available_copies,
                total: title.total_copies,
              })}
            </Badge>
          ) : (
            <Badge tone="warning">{t("noneAvailable")}</Badge>
          )}
          <Badge tone="neutral" appearance="outline">
            {title.is_opac ? t("opacShown") : t("opacHidden")}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

/** Who waits for this title, in order, with each hold's state. */
export function ReservationQueue({
  isLoading,
  error,
  onRetry,
  reservations,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  reservations: {
    id: string;
    member_user_id: string;
    status: string;
    position?: number;
    requested_at: string;
  }[];
}): ReactElement {
  const t = useTranslations("app.library.titleDetail");
  const tReserve = useTranslations("app.library.me.reserve");
  const locale = useLocale() as Locale;
  const names = useDirectoryNames(reservations.map((r) => r.member_user_id));
  if (error) return <QueryError retry={onRetry} error={error} />;
  if (isLoading) return <SkeletonDetail />;
  if (reservations.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<domainIcons.library aria-hidden="true" />}
          title={t("noReservationsTitle")}
          description={t("noReservationsBody")}
        />
      </Card>
    );
  }
  return (
    <List framed>
      {reservations.map((reservation) => (
        <ListRow
          key={reservation.id}
          title={names.get(reservation.member_user_id)?.name ?? t("unknownMember")}
          meta={t("requestedOn", {
            date: new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
              day: "numeric",
              month: "short",
            }).format(new Date(reservation.requested_at)),
          })}
          href={`/library/members/${encodeURIComponent(reservation.member_user_id)}`}
          trailing={
            <Badge tone={toneOf(RESERVATION_STATUS_TONE, reservation.status)}>
              {reservation.status === "waiting" && reservation.position
                ? tReserve("queuePosition", { position: reservation.position })
                : tReserve(`status.${reservation.status}`)}
            </Badge>
          }
        />
      ))}
    </List>
  );
}

/** The catalogue record, field by field, empty fields marked rather than dropped. */
export function BibliographicRecord({ title }: { title: LibraryTitle }): ReactElement {
  const t = useTranslations("app.library.titleDetail.fields");
  return (
    <Card padding="md">
      <DataList layout="stacked" columns={2}>
        <DataListItem label={t("author")}>{title.author}</DataListItem>
        <DataListItem label={t("additionalAuthors")}>{title.additional_authors}</DataListItem>
        <DataListItem label={t("publisher")}>
          {[title.publisher, title.publish_place].filter(Boolean).join(", ")}
        </DataListItem>
        <DataListItem label={t("publishYear")}>{title.publish_year}</DataListItem>
        <DataListItem label={t("edition")}>{title.edition}</DataListItem>
        <DataListItem label={t("pages")}>{title.pages}</DataListItem>
        <DataListItem label={t("isbn")}>{title.isbn}</DataListItem>
        <DataListItem label={t("classification")}>{title.classification}</DataListItem>
        <DataListItem label={t("callNumber")}>{title.call_number}</DataListItem>
        <DataListItem label={t("language")}>{title.language}</DataListItem>
        <DataListItem label={t("subjects")} fullWidth>
          {title.subjects}
        </DataListItem>
        <DataListItem label={t("abstract")} fullWidth>
          {title.abstract}
        </DataListItem>
      </DataList>
    </Card>
  );
}
