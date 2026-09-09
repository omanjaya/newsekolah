"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type ViolationType,
  useCreateViolationTypeMutation,
  useUpdateViolationTypeMutation,
} from "../api";

export function ViolationTypeForm({
  initial,
  onDone,
}: {
  initial?: ViolationType;
  onDone: () => void;
}): ReactElement {
  const tCatalog = useTranslations("app.discipline.catalog");
  const t = useTranslations("app.discipline.catalog.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateViolationTypeMutation();
  const update = useUpdateViolationTypeMutation();

  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [points, setPoints] = useState(String(initial?.points ?? ""));
  const [category, setCategory] = useState(initial?.category ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          code: code.trim(),
          name: name.trim(),
          points: Number(points),
          category: category.trim() || undefined,
          is_active: isActive,
        };
        const onSuccess = () => {
          toast.success(tCatalog("saved"));
          onDone();
        };
        const onError = (error: unknown) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (initial) {
          update.mutate({ id: initial.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("code")}</span>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          required
          maxLength={20}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("points")}</span>
        <Input
          type="number"
          value={points}
          onChange={(e) => {
            setPoints(e.target.value);
          }}
          required
          min={0}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("category")}</span>
        <Input
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
          }}
          placeholder={t("categoryPlaceholder")}
          maxLength={100}
        />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox
          checked={isActive}
          onCheckedChange={(v) => {
            setIsActive(v === true);
          }}
        />
        {t("active")}
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
