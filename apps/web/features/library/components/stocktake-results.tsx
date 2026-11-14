"use client";

import { formatNumber } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  Stat,
  StatGrid,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { BookCheck, BookDashed, BookX, MapPinned, ScanLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLookup } from "../../reference/api";
import type { LibraryCopy } from "../api";
import { useLibraryLocationsQuery } from "../copies-api";
import type { LibraryStocktakeResult } from "../stocktake-api";

import { LibraryTitleName } from "./library-title-name";

/** How many copies a result tab lists before pointing to the XLSX report. */
const PREVIEW_LIMIT = 30;

type Bucket = "missing" | "unexpected" | "misplaced";

interface ResultRow {
  copy: LibraryCopy;
  /** Where a misplaced copy was found, by location id. */
  foundLocationId?: string;
}

/**
 * A closed session's reconciliation: the counts as one strip, then the
 * missing, unexpected and misplaced copies as tabs, each copy by its book
 * title with barcode and shelf, so the librarian can act without opening
 * the XLSX. A bucket can hold thousands of copies (every copy is missing
 * until scanned), so each tab lists the first 30 and points to the report.
 */
export function StocktakeResults({ result }: { result: LibraryStocktakeResult }): ReactElement {
  const t = useTranslations("app.library.stocktake.result");
  const locale = useLocale() as Locale;
  const num = (value: number) => formatNumber(value, { locale });
  const buckets: Record<Bucket, ResultRow[]> = {
    missing: result.missing.map((copy) => ({ copy })),
    unexpected: result.unexpected.map((copy) => ({ copy })),
    misplaced: result.misplaced.map((entry) => ({
      copy: entry.copy,
      foundLocationId: entry.found_location_id,
    })),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("heading")}</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        <StatGrid variant="strip" aria-label={t("heading")}>
          <Stat
            icon={<BookCheck />}
            category="blue"
            value={num(result.expected_count)}
            label={t("expected")}
          />
          <Stat
            icon={<ScanLine />}
            category="green"
            value={num(result.scanned_count)}
            label={t("scanned")}
          />
          <Stat
            icon={<BookX />}
            category="red"
            value={num(result.missing.length)}
            label={t("missing")}
          />
          <Stat
            icon={<BookDashed />}
            category="amber"
            value={num(result.unexpected.length)}
            label={t("unexpected")}
          />
          <Stat
            icon={<MapPinned />}
            category="purple"
            value={num(result.misplaced.length)}
            label={t("misplaced")}
          />
        </StatGrid>
      </div>
      <Tabs defaultValue="missing" className="border-t border-line pt-3">
        <div className="px-5">
          <TabsList variant="underline" aria-label={t("bucketsLabel")}>
            {(["missing", "unexpected", "misplaced"] as const).map((bucket) => (
              <TabsTrigger key={bucket} value={bucket} count={buckets[bucket].length}>
                {t(bucket)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {(["missing", "unexpected", "misplaced"] as const).map((bucket) => (
          <TabsContent key={bucket} value={bucket}>
            <ResultList bucket={bucket} rows={buckets[bucket]} />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function ResultList({ bucket, rows }: { bucket: Bucket; rows: ResultRow[] }): ReactElement {
  const t = useTranslations("app.library.stocktake.result");
  const locale = useLocale() as Locale;
  const locations = useLibraryLocationsQuery();
  const locationMap = useLookup(locations.data?.data);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BookCheck aria-hidden="true" />}
        tone="success"
        title={t(`empty.${bucket}`)}
      />
    );
  }
  const shown = rows.slice(0, PREVIEW_LIMIT);
  const rest = rows.length - shown.length;
  const place = (id: string | undefined) => (id ? locationMap.get(id)?.name : undefined);
  return (
    <>
      <List aria-label={t(bucket)}>
        {shown.map(({ copy, foundLocationId }) => (
          <ListRow
            key={copy.id}
            title={<LibraryTitleName titleId={copy.title_id} />}
            meta={[
              copy.barcode,
              foundLocationId
                ? t("foundAt", {
                    expected: place(copy.location_id) ?? "-",
                    found: place(foundLocationId) ?? "-",
                  })
                : place(copy.location_id),
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
      </List>
      {rest > 0 && (
        <p className="px-5 py-4 text-caption text-fg-muted">
          {t("moreInReport", { count: formatNumber(rest, { locale }) })}
        </p>
      )}
    </>
  );
}
