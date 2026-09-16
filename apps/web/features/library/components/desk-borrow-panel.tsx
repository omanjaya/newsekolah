"use client";

import { ApiError } from "@newsekolah/api-client";
import { BarcodeScannerField, Button, useToast } from "@newsekolah/ui";
import type { BarcodeScanEvent } from "@newsekolah/ui";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiClient } from "../../../lib/api/client";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryLookupResult,
  useBatchBorrowLoansMutation,
  useFindLibraryCopyByCodeMutation,
} from "../desk-api";

import { LibraryLookupField } from "./library-lookup-field";

interface PendingCopy {
  barcode: string;
  title: string;
}
type Member = NonNullable<LibraryLookupResult["member"]>;
interface Rejected {
  barcode: string;
  reason: string;
}

/**
 * Lends several barcodes to one member in one pass: pick the borrower by
 * name instead of pasting a UUID, scan or search copies onto a pending
 * list, then commit the whole batch and see which barcodes were rejected.
 */
export function DeskBorrowPanel(): ReactElement {
  const t = useTranslations("app.library.desk.borrow");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const client = useApiClient();

  const [member, setMember] = useState<Member | null>(null);
  const [pending, setPending] = useState<PendingCopy[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);

  const findCopy = useFindLibraryCopyByCodeMutation();
  const batchBorrow = useBatchBorrowLoansMutation();

  function addBarcode(barcode: string, title: string) {
    setPending((prev) =>
      prev.some((p) => p.barcode === barcode) ? prev : [...prev, { barcode, title }],
    );
  }

  async function handleScan(event: BarcodeScanEvent) {
    setScanError("");
    setScanning(true);
    try {
      const copy = await findCopy.mutateAsync(event.code);
      const titleResponse = await client.GET("/v1/library/titles/{titleId}", {
        params: { path: { titleId: copy.title_id } },
      });
      addBarcode(copy.barcode, titleResponse.title);
    } catch {
      setScanError(t("codeNotFound", { code: event.code }));
    } finally {
      setScanning(false);
    }
  }

  function submit() {
    if (!member || pending.length === 0) return;
    batchBorrow.mutate(
      { member_user_id: member.user_id, barcodes: pending.map((p) => p.barcode) },
      {
        onSuccess: (result) => {
          const rejectedBarcodes = new Set(result.rejected.map((r) => r.barcode));
          setPending((prev) => prev.filter((p) => rejectedBarcodes.has(p.barcode)));
          setRejected(result.rejected);
          if (result.loans.length > 0) {
            toast.success(t("success", { count: result.loans.length }));
          }
          if (result.rejected.length > 0) {
            toast.error(t("someRejected", { count: result.rejected.length }));
          }
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[15px] font-semibold text-fg">{t("heading")}</h2>

      <LibraryLookupField
        onSelectMember={(selected) => {
          setMember(selected);
        }}
        onSelectCopy={(copy) => {
          addBarcode(copy.barcode, copy.title);
        }}
        placeholder={t("searchPlaceholder")}
      />

      {member ? (
        <div className="flex items-center justify-between rounded-xs border border-border bg-bg px-3 py-2 text-[13px]">
          <div className="flex flex-col">
            <span className="font-medium text-fg">{member.user_name}</span>
            <span className="text-[12px] text-fg-muted">
              {[member.member_no, member.nis, member.username].filter(Boolean).join(" - ")}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMember(null);
            }}
          >
            {t("changeMember")}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-fg-muted">{t("noMemberSelected")}</p>
      )}

      <BarcodeScannerField
        label={t("scanLabel")}
        onScan={(event) => void handleScan(event)}
        submitLabel={t("scanSubmit")}
        disabled={!member || scanning}
      />
      {scanError && <p className="text-[13px] text-status-absent">{scanError}</p>}

      {pending.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pending.map((copy) => (
            <li
              key={copy.barcode}
              className="flex items-center justify-between rounded-xs border border-border px-3 py-2 text-[13px]"
            >
              <span className="text-fg">
                {copy.title} <span className="text-fg-muted">({copy.barcode})</span>
              </span>
              <button
                type="button"
                aria-label={t("removeFromList", { barcode: copy.barcode })}
                className="text-fg-muted hover:text-status-absent"
                onClick={() => {
                  setPending((prev) => prev.filter((p) => p.barcode !== copy.barcode));
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xs border border-status-absent/40 bg-status-absent/5 p-3">
          <span className="text-[13px] font-medium text-status-absent">{t("rejectedTitle")}</span>
          <ul className="flex flex-col gap-1">
            {rejected.map((item) => (
              <li key={item.barcode} className="text-[13px] text-fg">
                {item.barcode}: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Button
          type="button"
          loading={batchBorrow.isPending}
          disabled={!member || pending.length === 0}
          onClick={submit}
        >
          {t("submit", { count: pending.length })}
        </Button>
      </div>
    </div>
  );
}
