"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Switch,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type LibraryLoanRule,
  type LibraryLoanRuleWrite,
  useCreateLibraryLoanRuleMutation,
  useDeleteLibraryLoanRuleMutation,
  useLibraryLoanRulesQuery,
} from "../loan-rules-api";
import { useLibraryMemberTypesQuery } from "../members-api";

import { LibraryPolicyDialog } from "./library-policy-dialog";

/** Dated loan rules per member type: shorten or extend limits, or close lending, for a period. */
export function LoanRulesView(): ReactElement {
  const t = useTranslations("app.library.loanRules");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_settings");

  const { data, isLoading } = useLibraryLoanRulesQuery();
  const memberTypes = useLibraryMemberTypesQuery();
  const memberTypeMap = useMemo(
    () => new Map((memberTypes.data?.data ?? []).map((mt) => [mt.id, mt.name])),
    [memberTypes.data],
  );
  const deleteRule = useDeleteLibraryLoanRuleMutation();

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LibraryLoanRule | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryLoanRule>[]>(
    () => [
      {
        id: "memberType",
        header: t("columns.memberType"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.member_type_id
            ? (memberTypeMap.get(row.original.member_type_id) ?? row.original.member_type_id)
            : t("everyMemberType"),
      },
      {
        id: "period",
        header: t("columns.period"),
        enableSorting: false,
        cell: ({ row }) =>
          `${formatDate(row.original.starts_on, { locale })} - ${formatDate(row.original.ends_on, { locale })}`,
      },
      {
        id: "allowLoans",
        header: t("columns.allowLoans"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.allow_loans ? "accent" : "neutral"}>
            {row.original.allow_loans ? t("loansOpen") : t("loansClosed")}
          </Badge>
        ),
      },
      {
        id: "limits",
        header: t("columns.limits"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.max_loan_items || row.original.max_loan_days
            ? t("limitsValue", {
                items: row.original.max_loan_items ?? "-",
                days: row.original.max_loan_days ?? "-",
              })
            : t("limitsDefault"),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-status-absent"
              onClick={() => {
                setDeleting(row.original);
              }}
            >
              {t("delete")}
            </Button>
          ) : null,
      },
    ],
    [t, locale, memberTypeMap, canManage],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <div className="flex flex-wrap gap-2">
              <LibraryPolicyDialog />
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => {
                  setCreating(true);
                }}
              >
                {t("add")}
              </Button>
            </div>
          )
        }
      />

      <DataTable
        stateKey="features/library/components/loan-rules-view:1"
        mode="local"
        searchable={false}
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
        }}
      >
        <DialogContent title={t("add")}>
          {creating && (
            <LoanRuleForm
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteTitle")}
        description={deleting ? t("deleteBody") : ""}
        destructive
        confirming={deleteRule.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteRule.mutateAsync(deleting.id);
            toast.success(t("deleted"));
            setDeleting(null);
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
    </div>
  );
}

function LoanRuleForm({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.library.loanRules.form");
  const apiErrorMessage = useApiErrorMessage();
  const memberTypes = useLibraryMemberTypesQuery();
  const create = useCreateLibraryLoanRuleMutation();

  const [memberTypeId, setMemberTypeId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [allowLoans, setAllowLoans] = useState(true);
  const [maxLoanItems, setMaxLoanItems] = useState("");
  const [maxLoanDays, setMaxLoanDays] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const body: LibraryLoanRuleWrite = {
          member_type_id: memberTypeId || undefined,
          starts_on: startsOn,
          ends_on: endsOn,
          allow_loans: allowLoans,
          max_loan_items: maxLoanItems ? Number(maxLoanItems) : undefined,
          max_loan_days: maxLoanDays ? Number(maxLoanDays) : undefined,
          notes: notes.trim() || undefined,
        };
        create.mutate(body, {
          onSuccess: onDone,
          onError: (err) => {
            setError(
              err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("memberType")}</span>
        <Select
          options={(memberTypes.data?.data ?? []).map((mt) => ({ value: mt.id, label: mt.name }))}
          value={memberTypeId}
          onValueChange={setMemberTypeId}
          placeholder={t("memberTypeAll")}
        />
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("startsOn")}</span>
          <Input
            type="date"
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("endsOn")}</span>
          <Input
            type="date"
            value={endsOn}
            onChange={(e) => {
              setEndsOn(e.target.value);
            }}
            required
            min={startsOn || undefined}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <Switch checked={allowLoans} onCheckedChange={setAllowLoans} />
        <span className="font-medium">{t("allowLoans")}</span>
      </label>
      {allowLoans && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("maxLoanItems")}</span>
            <Input
              type="number"
              min={0}
              value={maxLoanItems}
              onChange={(e) => {
                setMaxLoanItems(e.target.value);
              }}
              placeholder={t("keepDefault")}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("maxLoanDays")}</span>
            <Input
              type="number"
              min={0}
              value={maxLoanDays}
              onChange={(e) => {
                setMaxLoanDays(e.target.value);
              }}
              placeholder={t("keepDefault")}
            />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("notes")}</span>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      {error && <p className="text-[13px] text-status-absent">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!startsOn || !endsOn}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
