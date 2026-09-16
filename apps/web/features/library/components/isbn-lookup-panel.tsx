"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryExternalBibliography,
  useDownloadLibraryCoverMutation,
  useLookupExternalIsbnMutation,
} from "../isbn-lookup-api";

/**
 * Below the ISBN field in the create-title form: looks up the ISBN
 * externally (local catalogue, then Open Library, then Google Books) and
 * offers to prefill the form and import the cover, without doing either
 * automatically.
 */
export function IsbnLookupPanel({
  isbn,
  onApply,
  onCoverImported,
}: {
  isbn: string;
  onApply: (bibliography: LibraryExternalBibliography) => void;
  onCoverImported: (assetId: string) => void;
}): ReactElement | null {
  const t = useTranslations("app.library.catalogue.isbnLookup");
  const apiErrorMessage = useApiErrorMessage();
  const lookup = useLookupExternalIsbnMutation();
  const downloadCover = useDownloadLibraryCoverMutation();
  const [coverImported, setCoverImported] = useState(false);
  const [error, setError] = useState("");

  const normalized = isbn.trim();
  const result = lookup.data;

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-fg-muted">{t("hint")}</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={lookup.isPending}
          disabled={normalized.length < 3}
          onClick={() => {
            setError("");
            setCoverImported(false);
            lookup.mutate(normalized, {
              onError: (err) => {
                setError(
                  err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
                );
              },
            });
          }}
        >
          {t("search")}
        </Button>
      </div>

      {error && <p className="text-[13px] text-status-absent">{error}</p>}

      {result && !result.found && <p className="text-[13px] text-fg-muted">{t("notFound")}</p>}

      {result?.found &&
        result.bibliography &&
        (() => {
          const bibliography = result.bibliography;
          return (
            <div className="flex gap-3">
              {bibliography.cover_image_url && (
                <img
                  src={bibliography.cover_image_url}
                  alt=""
                  className="h-24 w-16 shrink-0 rounded-xs border border-border object-cover"
                />
              )}
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-[13px] font-medium text-fg">{bibliography.title}</span>
                <span className="text-[12px] text-fg-muted">
                  {[bibliography.main_author, bibliography.publisher].filter(Boolean).join(" - ")}
                </span>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onApply(bibliography);
                    }}
                  >
                    {t("apply")}
                  </Button>
                  {bibliography.cover_image_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={downloadCover.isPending}
                      disabled={coverImported}
                      onClick={() => {
                        setError("");
                        downloadCover.mutate(bibliography.cover_image_url, {
                          onSuccess: (data) => {
                            onCoverImported(data.asset_id);
                            setCoverImported(true);
                          },
                          onError: (err) => {
                            setError(
                              err instanceof ApiError
                                ? apiErrorMessage(err.code)
                                : apiErrorMessage("UNKNOWN"),
                            );
                          },
                        });
                      }}
                    >
                      {coverImported ? t("coverImported") : t("importCover")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
