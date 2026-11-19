"use client";

import {
  Alert,
  Button,
  cn,
  domainIcons,
  EmptyState,
  FilteredEmptyState,
  List,
  ListRow,
  PageHeader,
  SearchInput,
  SegmentedControl,
  SkeletonList,
  useDebouncedCallback,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { PUBLIC_CONTAINER } from "../../../components/public-container";
import { useDocumentTitle } from "../../../lib/page-title";
import { useOpacTitlesQuery, type LibraryOpacTitle } from "../opac-api";
import { classificationGroups } from "../opac-classifications";
import { useOpacSearchParams } from "../use-opac-search-params";

import { OpacAvailability } from "./opac-availability";
import { OpacCover } from "./opac-cover";
import { OpacHighlights } from "./opac-highlights";

const PAGE_SIZE = 20;
/** The shelves repeat what the list shows on a small catalogue, so they wait for a real one. */
const HIGHLIGHTS_MIN_TITLES = 12;
const ALL = "*";

/**
 * Public catalogue search: no session, reachable from a kiosk or a phone.
 * Search first (a large field and the classification groups as one row of
 * pills), then the titles as one calm list with their availability. The
 * search and the filter live in the address (`?q=&klasifikasi=`).
 */
export function OpacView(): ReactElement {
  const t = useTranslations("app.library.opac");
  useDocumentTitle(t("title"));
  const [params, setParams] = useOpacSearchParams();
  const [draft, setDraft] = useState(params.q);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const commitSearch = useDebouncedCallback((value: string) => {
    setLimit(PAGE_SIZE);
    setParams({ q: value.trim() });
  }, 300);

  const query = useOpacTitlesQuery(params.q, {
    classificationPrefix: params.klasifikasi || undefined,
    limit,
  });
  // The first page of the whole catalogue (the same cache entry as the
  // unfiltered list) names the filter groups and decides on the shelves.
  const catalogue = useOpacTitlesQuery("", { limit: PAGE_SIZE });
  const groups = classificationGroups(catalogue.data?.data ?? []);
  const titles = query.data?.data ?? [];
  const filtered = params.q !== "" || params.klasifikasi !== "";
  const hasMore = titles.length >= limit;
  const showHighlights = !filtered && (catalogue.data?.data.length ?? 0) >= HIGHLIGHTS_MIN_TITLES;

  function reset() {
    setDraft("");
    setLimit(PAGE_SIZE);
    setParams({ q: "", klasifikasi: "" });
  }

  return (
    <div className={cn(PUBLIC_CONTAINER, "flex flex-col gap-8 py-8 md:py-12")}>
      <div className="flex animate-enter flex-col gap-5">
        <PageHeader
          // Holds the line while the library's name loads, so the title does not jump.
          eyebrow={<span className="block min-h-4.5">{query.data?.library_name}</span>}
          title={t("title")}
          description={t("description")}
          compactTitle={false}
          className="pb-0"
        />
        <div role="search" className="flex flex-col gap-3">
          <SearchInput
            aria-label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            value={draft}
            enterKeyHint="search"
            className="h-12 rounded-lg bg-surface shadow-1 md:pointer-fine:h-12"
            onChange={(event) => {
              setDraft(event.target.value);
              commitSearch(event.target.value);
            }}
            onClear={() => {
              setDraft("");
              setLimit(PAGE_SIZE);
              setParams({ q: "" });
            }}
          />
          {groups.length > 1 && (
            <SegmentedControl
              aria-label={t("filterLabel")}
              size="sm"
              className="self-start"
              options={[
                { value: ALL, label: t("filterAll") },
                ...groups.map((group) => ({ value: group, label: group })),
              ]}
              value={params.klasifikasi || ALL}
              onValueChange={(value) => {
                setLimit(PAGE_SIZE);
                setParams({ klasifikasi: value === ALL ? "" : value });
              }}
            />
          )}
        </div>
      </div>

      {showHighlights && <OpacHighlights />}

      <section className="flex flex-col gap-3" aria-busy={query.isFetching || undefined}>
        {query.isError ? (
          <Alert
            tone="danger"
            title={t("errorTitle")}
            action={
              <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
                {t("retry")}
              </Button>
            }
          >
            {t("errorBody")}
          </Alert>
        ) : query.isPending ? (
          <SkeletonList rows={4} framed />
        ) : titles.length === 0 ? (
          filtered ? (
            <FilteredEmptyState
              title={t("emptyTitle")}
              description={t("emptyBody")}
              resetLabel={t("clearSearch")}
              onReset={reset}
            />
          ) : (
            <EmptyState
              icon={<domainIcons.library aria-hidden="true" />}
              title={t("catalogueEmptyTitle")}
              description={t("catalogueEmptyBody")}
            />
          )
        ) : (
          <>
            <p aria-live="polite" className="text-label text-fg-muted">
              {hasMore
                ? t("resultCountFirst", { count: titles.length })
                : t("resultCount", { count: titles.length })}
            </p>
            <List
              framed
              className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}
            >
              {titles.map((title) => (
                <TitleRow key={title.id} title={title} />
              ))}
            </List>
            {hasMore && (
              <Button
                variant="secondary"
                className="self-center"
                loading={query.isFetching}
                onClick={() => {
                  setLimit((current) => current + PAGE_SIZE);
                }}
              >
                {t("loadMore")}
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * One title: a stand-in cover, the title, author and year, and its
 * availability, at the row's end from 640px and under the author on a
 * phone, where the title needs the whole width.
 */
function TitleRow({ title }: { title: LibraryOpacTitle }): ReactElement {
  // A title with no author (a magazine, a dictionary) names its publisher
  // instead, so the year never stands alone like a missing field.
  const byline = [title.author || title.publisher, title.publish_year].filter(Boolean).join(" · ");
  const availability = (
    <OpacAvailability available={title.available_copies} total={title.total_copies} />
  );
  return (
    <ListRow
      href={`/opac/${title.id}`}
      leading={<OpacCover title={title.title} />}
      title={title.title}
      titleLines={2}
      meta={
        <>
          {byline && <span className="block truncate">{byline}</span>}
          <span className="mt-1.5 flex sm:hidden">{availability}</span>
        </>
      }
      trailing={<span className="hidden sm:flex">{availability}</span>}
    />
  );
}
