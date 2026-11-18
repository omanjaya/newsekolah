"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Card, Field, FormError, Input } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryExternalBibliography,
  useDownloadLibraryCoverMutation,
  useLookupExternalIsbnMutation,
} from "../isbn-lookup-api";

/**
 * The ISBN field of the create-title form with its lookup button beside
 * it: looks the ISBN up externally (local catalogue, then Open Library,
 * then Google Books) and, under the field, offers to prefill the form and
 * import the cover, without doing either automatically. The result card
 * appears only for an answer: a match, nothing found, or an error.
 */
export function IsbnLookupField({
  label,
  isbn,
  onIsbnChange,
  onApply,
  onCoverImported,
  warning,
}: {
  label: string;
  isbn: string;
  onIsbnChange: (value: string) => void;
  onApply: (bibliography: LibraryExternalBibliography) => void;
  onCoverImported: (assetId: string) => void;
  /** Shown between the field and the lookup result (the duplicate warning). */
  warning?: ReactNode;
}): ReactElement {
  const t = useTranslations("app.library.catalogue.isbnLookup");
  const apiErrorMessage = useApiErrorMessage();
  const lookup = useLookupExternalIsbnMutation();
  const downloadCover = useDownloadLibraryCoverMutation();
  const [coverImported, setCoverImported] = useState(false);
  const [error, setError] = useState("");

  const normalized = isbn.trim();
  const result = lookup.data;

  const hasAnswer = Boolean(error) || Boolean(result);

  return (
    <>
      <Field label={label}>
        <div className="flex items-center gap-2">
          <Input
            value={isbn}
            onChange={(e) => {
              onIsbnChange(e.target.value);
            }}
            maxLength={32}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            loading={lookup.isPending}
            disabled={normalized.length < 3}
            onClick={() => {
              setError("");
              setCoverImported(false);
              lookup.mutate(normalized, {
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
            {t("search")}
          </Button>
        </div>
      </Field>
      {warning}
      {hasAnswer && (
        <Card tone="sunken" padding="sm">
          {error && <FormError>{error}</FormError>}

          {result && !result.found && <p className="text-body-sm text-fg-muted">{t("notFound")}</p>}

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
                      className="h-24 w-16 shrink-0 rounded-sm object-cover shadow-1"
                    />
                  )}
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-label text-fg">{bibliography.title}</span>
                    <span className="text-caption text-fg-muted">
                      {[bibliography.main_author, bibliography.publisher]
                        .filter(Boolean)
                        .join(" - ")}
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
        </Card>
      )}
    </>
  );
}
