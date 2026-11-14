"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  List,
  ListRow,
  RowActionsMenu,
  SkeletonList,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type Discount,
  type FeeType,
  useDeleteDiscountMutation,
  useFeeTypeDiscountsQuery,
} from "../api";
import { useBillingFormat } from "../lib/use-billing-format";

import { DiscountForm } from "./discount-form";

/**
 * The per-student discounts on one fee: who gets one, why, and how much
 * (a percentage, a fixed amount or a full waiver). Adding or editing one
 * swaps the list for the form in the same dialog; removing one asks first.
 */
export function FeeTypeDiscountsDialog({
  feeType,
  onOpenChange,
}: {
  feeType: FeeType | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.billing.discounts");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { money } = useBillingFormat();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [removing, setRemoving] = useState<Discount | null>(null);
  const { data, isLoading, isError, error, refetch } = useFeeTypeDiscountsQuery(
    feeType?.id ?? "",
    feeType !== null,
  );
  const remove = useDeleteDiscountMutation();

  const discounts = data?.data ?? [];
  const studentMap = useDirectoryNames(discounts.map((item) => item.student_user_id));
  const nameOf = (discount: Discount) =>
    studentMap.get(discount.student_user_id)?.name ?? t("unknownStudent");
  const listing = feeType !== null && !adding && !editing;

  function describe(discount: Discount): string {
    if (discount.kind === "waiver") return t("kind.waiver");
    if (discount.kind === "percentage")
      return t("percentageValue", { value: ((discount.percentage_bp ?? 0) / 100).toString() });
    return money(discount.amount_minor ?? 0, feeType?.currency);
  }

  return (
    <Dialog
      open={feeType !== null}
      onOpenChange={(open) => {
        setAdding(false);
        setEditing(null);
        onOpenChange(open);
      }}
    >
      <DialogContent
        title={feeType ? t("title", { name: feeType.name }) : ""}
        size="lg"
        footer={
          listing && discounts.length > 0 ? (
            <Button
              icon={<Plus />}
              onClick={() => {
                setAdding(true);
              }}
            >
              {t("add")}
            </Button>
          ) : undefined
        }
      >
        {listing &&
          (isLoading ? (
            <SkeletonList rows={3} />
          ) : isError && !data ? (
            <QueryError retry={() => refetch()} error={error} />
          ) : discounts.length === 0 ? (
            <EmptyState
              icon={<domainIcons.billing />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              action={
                <Button
                  icon={<Plus />}
                  onClick={() => {
                    setAdding(true);
                  }}
                >
                  {t("add")}
                </Button>
              }
            />
          ) : (
            <List framed aria-label={t("listLabel")}>
              {discounts.map((discount) => (
                <ListRow
                  key={discount.id}
                  leading={<Avatar name={nameOf(discount)} size={32} decorative />}
                  title={nameOf(discount)}
                  meta={discount.reason}
                  trailing={
                    <Badge tone={discount.is_active ? "success" : "neutral"} size="sm">
                      {describe(discount)}
                    </Badge>
                  }
                  action={
                    <RowActionsMenu
                      ariaLabel={t("rowActions", { name: nameOf(discount) })}
                      items={[
                        {
                          label: t("edit"),
                          icon: <Pencil />,
                          onClick: () => {
                            setEditing(discount);
                          },
                        },
                        {
                          label: t("remove"),
                          icon: <Trash2 />,
                          tone: "danger",
                          onClick: () => {
                            setRemoving(discount);
                          },
                        },
                      ]}
                    />
                  }
                />
              ))}
            </List>
          ))}
        {feeType && (adding || editing) && (
          <DiscountForm
            key={editing?.id ?? "new"}
            initial={editing ?? undefined}
            feeTypeId={feeType.id}
            onDone={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        )}
        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          title={t("removeTitle")}
          description={removing ? t("removeBody", { name: nameOf(removing) }) : ""}
          confirmLabel={t("remove")}
          tone="danger"
          confirming={remove.isPending}
          onConfirm={() => {
            if (!removing) return;
            remove.mutate(removing.id, {
              onError: (removeError) => {
                toast.error(
                  removeError instanceof ApiError
                    ? apiErrorMessage(removeError.code)
                    : apiErrorMessage("UNKNOWN"),
                );
              },
              onSettled: () => {
                setRemoving(null);
              },
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
