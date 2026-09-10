"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { type FeeType, useDeleteDiscountMutation, useFeeTypeDiscountsQuery } from "../api";

import { DiscountForm } from "./discount-form";

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
  const [adding, setAdding] = useState(false);
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const { data, isLoading } = useFeeTypeDiscountsQuery(feeType?.id ?? "", feeType !== null);
  const remove = useDeleteDiscountMutation();

  const discounts = data?.data ?? [];

  function describe(kind: string, percentageBp?: number, amountMinor?: number): string {
    if (kind === "waiver") return t("kind.waiver");
    if (kind === "percentage")
      return t("percentageValue", { value: ((percentageBp ?? 0) / 100).toString() });
    return t("fixedValue", { amount: amountMinor ?? 0 });
  }

  return (
    <Dialog
      open={feeType !== null}
      onOpenChange={(open) => {
        setAdding(false);
        onOpenChange(open);
      }}
    >
      <DialogContent title={feeType ? t("title", { name: feeType.name }) : ""}>
        {feeType && !adding && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => {
                  setAdding(true);
                }}
              >
                {t("add")}
              </Button>
            </div>
            {isLoading ? null : discounts.length === 0 ? (
              <EmptyState
                icon={<domainIcons.billing aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {discounts.map((discount) => (
                  <li
                    key={discount.id}
                    className="flex items-center justify-between gap-2 rounded-sm border border-border p-2 text-[13px]"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-fg">
                        {studentMap.get(discount.student_user_id)?.name ?? t("unknownStudent")}
                      </span>
                      <span className="truncate text-fg-muted">{discount.reason}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={discount.is_active ? "accent" : "neutral"}>
                        {describe(discount.kind, discount.percentage_bp, discount.amount_minor)}
                      </Badge>
                      <IconButton
                        icon={<Trash2 />}
                        aria-label={t("remove")}
                        onClick={() => {
                          remove.mutate(discount.id, {
                            onError: (error) => {
                              toast.error(
                                error instanceof ApiError
                                  ? apiErrorMessage(error.code)
                                  : apiErrorMessage("UNKNOWN"),
                              );
                            },
                          });
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {feeType && adding && (
          <DiscountForm
            feeTypeId={feeType.id}
            onDone={() => {
              setAdding(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
