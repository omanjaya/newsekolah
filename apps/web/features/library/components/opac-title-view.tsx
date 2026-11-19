"use client";

import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  DataList,
  DataListItem,
  EmptyState,
  List,
  ListRow,
  SkeletonDetail,
  TextLink,
} from "@newsekolah/ui";
import { ArrowLeft, BookX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useSyncExternalStore } from "react";

import { PUBLIC_CONTAINER } from "../../../components/public-container";
import { useDocumentTitle } from "../../../lib/page-title";
import { useOpacTitleQuery, type LibraryOpacTitleDetail } from "../opac-api";
import { OPAC_LAST_SEARCH_KEY } from "../use-opac-search-params";

import { OpacCover } from "./opac-cover";

type Copy = LibraryOpacTitleDetail["copies"][number];

function subscribe(): () => void {
  return () => undefined;
}

/** The catalogue as the visitor left it (search and filter), or its start. */
function useCatalogueHref(): string {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return `/opac${window.sessionStorage.getItem(OPAC_LAST_SEARCH_KEY) ?? ""}`;
      } catch {
        return "/opac";
      }
    },
    () => "/opac",
  );
}

/**
 * Public title detail, no session required: the book's identity (stand-in
 * cover, title, author) with how many copies are in now, then the copies
 * with the call number to find each on the shelf, then the bibliographic
 * details.
 *
 * Copy status labels are kept local (`detail.copyStatus.*`) rather than
 * sharing `app.library.copies.status`: this view renders outside
 * `(app)/library`, under the root provider's narrow `app.library.opac`
 * namespace slice (see `lib/i18n/namespace-sets.ts`), so it cannot reach
 * the rest of the `library` catalog.
 */
export function OpacTitleView({ titleId }: { titleId: string }): ReactElement {
  const t = useTranslations("app.library.opac");
  const catalogueHref = useCatalogueHref();
  const { data, isLoading, error } = useOpacTitleQuery(titleId);
  // The book's own title once it loads, so a shared link or a bookmark
  // says which book; the catalogue while it loads.
  useDocumentTitle(
    isLoading ? t("title") : error || !data ? t("detail.notFoundTitle") : data.title.title,
  );

  return (
    <div className={cn(PUBLIC_CONTAINER, "flex flex-col gap-6 py-6 md:py-10")}>
      <TextLink href={catalogueHref} className="inline-flex items-center gap-1.5 self-start">
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        {t("backToSearch")}
      </TextLink>

      {isLoading ? (
        <SkeletonDetail />
      ) : error || !data ? (
        <EmptyState
          icon={<BookX aria-hidden="true" />}
          title={t("detail.notFoundTitle")}
          description={t("detail.notFoundBody")}
        />
      ) : (
        <TitleDetail detail={data} />
      )}
    </div>
  );
}

function TitleDetail({ detail }: { detail: LibraryOpacTitleDetail }): ReactElement {
  const t = useTranslations("app.library.opac");
  const locale = useLocale();
  const { title, copies } = detail;
  const total = copies.length;
  const available = copies.filter((copy) => copy.status === "available").length;

  return (
    <div className="flex animate-enter flex-col gap-6">
      <header className="flex items-start gap-5">
        <OpacCover title={title.title} size="lg" />
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {title.classification && (
              <p className="text-body-sm text-fg-muted">{title.classification}</p>
            )}
            <CardTitle as="h1" className="text-display [overflow-wrap:anywhere]">
              {title.title}
            </CardTitle>
            {title.subtitle && <p className="text-body text-fg-muted">{title.subtitle}</p>}
            {title.author && <p className="text-body text-fg">{title.author}</p>}
          </div>
          <div>
            {total === 0 ? (
              <Badge tone="neutral">{t("detail.noCopiesShort")}</Badge>
            ) : available > 0 ? (
              <Badge tone="success" dot>
                {t("detail.availability", { available, total })}
              </Badge>
            ) : (
              <Badge tone="neutral">{t("detail.noneAvailable")}</Badge>
            )}
          </div>
        </div>
      </header>

      {title.abstract && <p className="text-body text-fg">{title.abstract}</p>}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("detail.copiesHeading", { count: total })}</CardTitle>
          <CardDescription>{t("detail.howToBorrow")}</CardDescription>
        </CardHeader>
        {total === 0 ? (
          <p className="px-5 pb-5 text-body-sm text-fg-muted">{t("detail.noCopies")}</p>
        ) : (
          <List>
            {copies.map((copy) => (
              <CopyRow key={copy.barcode} copy={copy} />
            ))}
          </List>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("detail.bibliography")}</CardTitle>
        </CardHeader>
        <DataList>
          {title.author && <DataListItem label={t("detail.author")}>{title.author}</DataListItem>}
          <DataListItem label={t("detail.publisher")}>
            {[title.publisher, title.publish_place].filter(Boolean).join(", ")}
          </DataListItem>
          <DataListItem label={t("detail.publishYear")}>{title.publish_year}</DataListItem>
          {title.edition && (
            <DataListItem label={t("detail.edition")}>{title.edition}</DataListItem>
          )}
          {title.pages && <DataListItem label={t("detail.pages")}>{title.pages}</DataListItem>}
          <DataListItem label={t("detail.isbn")}>
            {title.isbn && <span className="tabular-nums">{title.isbn}</span>}
          </DataListItem>
          <DataListItem label={t("detail.classification")}>{title.classification}</DataListItem>
          {title.call_number && (
            <DataListItem label={t("detail.callNumber")}>{title.call_number}</DataListItem>
          )}
          <DataListItem label={t("detail.language")}>
            {title.language && languageName(title.language, locale)}
          </DataListItem>
          {title.subjects && (
            <DataListItem label={t("detail.subjects")}>{title.subjects}</DataListItem>
          )}
        </DataList>
      </Card>
    </div>
  );
}

/** One copy: its call number (where it sits on the shelf), barcode and status. */
function CopyRow({ copy }: { copy: Copy }): ReactElement {
  const t = useTranslations("app.library.opac.detail");
  const access =
    copy.access === "read_in_place" || copy.access === "reference"
      ? t(`access.${copy.access}`)
      : null;
  return (
    <ListRow
      title={
        <>
          <span className="font-normal text-fg-muted">{t("callNumber")}</span> {copy.call_number}
        </>
      }
      meta={[`${t("barcode")} ${copy.barcode}`, access].filter(Boolean).join(" · ")}
      trailing={
        <Badge tone={copy.status === "available" ? "success" : "neutral"}>
          {t(`copyStatus.${copy.status}`)}
        </Badge>
      }
    />
  );
}

/** "ind" -> "Indonesia": catalogue records store ISO 639 codes. */
function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
