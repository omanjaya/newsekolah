"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, Input, PageHeader, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryStocktakeResult,
  useCloseStocktakeMutation,
  useLibraryStocktakeQuery,
  useScanStocktakeMutation,
} from "../api";

export function StocktakeSessionView({ stocktakeId }: { stocktakeId: string }): ReactElement {
  const t = useTranslations("app.library.stocktake");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const session = useLibraryStocktakeQuery(stocktakeId);
  const scan = useScanStocktakeMutation();
  const close = useCloseStocktakeMutation();

  const [barcode, setBarcode] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [result, setResult] = useState<LibraryStocktakeResult | null>(null);

  const isOpen = session.data?.status === "open";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("title")} title={session.data?.name ?? ""} />

      {isOpen ? (
        <>
          <form
            className="flex flex-wrap items-end gap-3 rounded-sm border border-border bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              scan.mutate(
                { stocktakeId, barcode: barcode.trim() },
                {
                  onSuccess: () => {
                    setScannedCount((count) => count + 1);
                    setBarcode("");
                  },
                  onError: (error) => {
                    toast.error(
                      error instanceof ApiError
                        ? apiErrorMessage(error.code)
                        : apiErrorMessage("UNKNOWN"),
                    );
                  },
                },
              );
            }}
          >
            <h2 className="w-full text-[15px] font-semibold text-fg">{t("scan.heading")}</h2>
            <Input
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value);
              }}
              placeholder={t("scan.placeholder")}
              required
              maxLength={64}
              className="max-w-xs"
            />
            <Button type="submit" loading={scan.isPending}>
              {t("scan.submit")}
            </Button>
            <span className="text-[13px] text-fg-muted">{scannedCount}</span>
          </form>

          <Button
            onClick={() => {
              close.mutate(
                { stocktakeId },
                {
                  onSuccess: (data) => {
                    setResult(data);
                  },
                  onError: (error) => {
                    toast.error(
                      error instanceof ApiError
                        ? apiErrorMessage(error.code)
                        : apiErrorMessage("UNKNOWN"),
                    );
                  },
                },
              );
            }}
            loading={close.isPending}
            className="self-start"
          >
            {t("close")}
          </Button>
        </>
      ) : null}

      {result && (
        <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[15px] font-semibold text-fg">{t("result.heading")}</h2>
          <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
            <div>
              <dt className="text-fg-muted">{t("result.expected")}</dt>
              <dd className="font-medium">{result.expected_count}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("result.scanned")}</dt>
              <dd className="font-medium">{result.scanned_count}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("result.missing")}</dt>
              <dd className="font-medium">{result.missing.length}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("result.unexpected")}</dt>
              <dd className="font-medium">{result.unexpected.length}</dd>
            </div>
          </dl>
          {result.missing.length > 0 && (
            <Alert variant="warning" title={t("result.missing")}>
              {result.missing.map((copy) => copy.barcode).join(", ")}
            </Alert>
          )}
          {result.unexpected.length > 0 && (
            <Alert variant="warning" title={t("result.unexpected")}>
              {result.unexpected.join(", ")}
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
