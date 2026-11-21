"use client";

import { Card, SectionHeader, Skeleton, UiLink, useScrollEdges } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId, useRef } from "react";

import { useOpacHighlightsQuery, type LibraryOpacTitle } from "../opac-api";

import { OpacAvailability } from "./opac-availability";
import { OpacCover } from "./opac-cover";

/**
 * New arrivals and most-borrowed titles on the catalogue's landing page
 * (GET /v1/opac/highlights, public), each as a shelf of covers that
 * scrolls sideways. The catalogue only shows it once it holds enough
 * titles for the shelves to say something the list below does not.
 */
export function OpacHighlights(): ReactElement | null {
  const t = useTranslations("app.library.opac.highlights");
  const { data, isLoading } = useOpacHighlightsQuery();

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-hidden" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="aspect-[2/3] w-32 shrink-0 rounded-sm" />
        ))}
      </div>
    );
  }

  if (!data || (data.newest.length === 0 && data.most_borrowed.length === 0)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {data.newest.length > 0 && <Shelf label={t("newest")} titles={data.newest} />}
      {data.most_borrowed.length > 0 && (
        <Shelf label={t("mostBorrowed")} titles={data.most_borrowed} />
      )}
    </div>
  );
}

function Shelf({ label, titles }: { label: string; titles: LibraryOpacTitle[] }): ReactElement {
  const titleId = useId();
  const scrollerRef = useRef<HTMLUListElement>(null);
  useScrollEdges(scrollerRef, { axis: "x" });
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <SectionHeader title={label} titleId={titleId} />
      {/* Bleeds to the screen edge on a phone; a half-shown cover behind a
          soft edge fade says there is more to scroll. */}
      <ul
        ref={scrollerRef}
        className="relative scrollbar-none scroll-fade-x -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:-mx-1 md:px-1"
      >
        {titles.map((title) => (
          <li key={title.id} className="w-32 shrink-0 snap-start sm:w-36">
            <Card asChild interactive className="flex h-full flex-col gap-2.5 p-2.5">
              <UiLink href={`/opac/${title.id}`}>
                <OpacCover title={title.title} size="md" />
                <span className="flex flex-col gap-0.5 px-0.5">
                  <span className="line-clamp-2 text-label text-fg">{title.title}</span>
                  <span className="truncate text-caption text-fg-muted">{title.author}</span>
                </span>
                <span className="mt-auto px-0.5">
                  <OpacAvailability
                    available={title.available_copies}
                    total={title.total_copies}
                    compact
                  />
                </span>
              </UiLink>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
