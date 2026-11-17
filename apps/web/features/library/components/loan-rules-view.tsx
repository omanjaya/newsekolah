"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  FormError,
  NumberInput,
  RowActionsMenu,
  Select,
  Switch,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { formatShortDateRange } from "../lib/short-date";
import {
  type LibraryLoanRule,
  type LibraryLoanRuleWrite,
  useCreateLibraryLoanRuleMutation,
  useDeleteLibraryLoanRuleMutation,
  useLibraryLoanRulesQuery,
} from "../loan-rules-api";
import { useLibraryMemberTypesQuery } from "../members-api";

import { LibraryPolicyDialog } from "./library-policy-dialog";

/**
 * Dated loan rules per member type: shorten or extend limits, or close
 * lending, for a period. A section of the library settings hub; adding a
 * rule and the general policy sit in the table's own toolbar.
 */
export function LoanRulesView(): ReactElement {
  const t = useTranslations("app.library.loanRules");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_settings");

  const { data, isLoading, error, refetch } = useLibraryLoanRulesQuery();
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
        meta: { card: "title" },
        cell: ({ row }) =>
          row.original.member_type_id
            ? (memberTypeMap.get(row.original.member_type_id) ?? row.original.member_type_id)
            : t("everyMemberType"),
      },
      {
        id: "period",
        header: t("columns.period"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) =>
          formatShortDateRange(row.original.starts_on, row.original.ends_on, locale),
      },
      {
        id: "allowLoans",
        header: t("columns.allowLoans"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge tone={row.original.allow_loans ? "success" : "warning"}>
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
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: LibraryLoanRule } }) => (
                <RowActionsMenu
                  ariaLabel={t("rowActions")}
                  items={[
                    {
                      label: t("delete"),
                      icon: <Trash2 className="size-4" aria-hidden="true" />,
                      tone: "danger",
                      onClick: () => {
                        setDeleting(row.original);
                      },
                    },
                  ]}
                />
              ),
            } satisfies ColumnDef<LibraryLoanRule>,
          ]
        : []),
    ],
    [t, locale, memberTypeMap, canManage],
  );

  const addButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t("add")}
    </Button>
  );

  return (
    <>
      <DataTable
        stateKey="features/library/components/loan-rules-view:1"
        mode="local"
        searchable={false}
        data={items}
        columns={columns}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        getRowId={(item) => item.id}
        toolbarActions={
          canManage ? (
            <>
              <LibraryPolicyDialog />
              {/* An empty list offers its own Tambah aturan: one primary at a time. */}
              {items.length > 0 && addButton}
            </>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={canManage ? addButton : undefined}
          />
        }
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("add")} size="md">
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
        tone="danger"
        confirming={deleteRule.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteRule.mutateAsync(deleting.id);
            toast.success(t("deleted"));
            setDeleting(null);
          } catch (failure) {
            toast.error(
              failure instanceof ApiError
                ? apiErrorMessage(failure.code)
                : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
    </>
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
  const [maxLoanItems, setMaxLoanItems] = useState<number | null>(null);
  const [maxLoanDays, setMaxLoanDays] = useState<number | null>(null);
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
          max_loan_items: maxLoanItems ?? undefined,
          max_loan_days: maxLoanDays ?? undefined,
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
      {error && <FormError>{error}</FormError>}
      <Field label={t("memberType")}>
        <Select
          options={(memberTypes.data?.data ?? []).map((mt) => ({ value: mt.id, label: mt.name }))}
          value={memberTypeId}
          onValueChange={setMemberTypeId}
          placeholder={t("memberTypeAll")}
        />
      </Field>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <Field label={t("startsOn")} required>
          <DatePicker value={startsOn} onChange={setStartsOn} required />
        </Field>
        <Field label={t("endsOn")} required>
          <DatePicker value={endsOn} onChange={setEndsOn} min={startsOn || undefined} required />
        </Field>
      </div>
      <Field label={t("allowLoans")} orientation="horizontal">
        <Switch checked={allowLoans} onCheckedChange={setAllowLoans} />
      </Field>
      {allowLoans && (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <Field label={t("maxLoanItems")} hint={t("keepDefault")}>
            <NumberInput value={maxLoanItems} onChange={setMaxLoanItems} min={0} />
          </Field>
          <Field label={t("maxLoanDays")} hint={t("keepDefault")}>
            <NumberInput value={maxLoanDays} onChange={setMaxLoanDays} min={0} />
          </Field>
        </div>
      )}
      <Field label={t("notes")}>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </Field>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!startsOn || !endsOn}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
