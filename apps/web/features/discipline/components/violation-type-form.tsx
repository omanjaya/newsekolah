"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  NumberInput,
  DialogFooter,
  Field,
  Button,
  Checkbox,
  Input,
  useToast,
} from "@newsekolah/ui";
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
      <Field label={t("code")}>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          required
          maxLength={20}
        />
      </Field>
      <Field label={t("name")}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={200}
        />
      </Field>
      <Field label={t("points")}>
        <NumberInput
          value={points === "" ? null : Number(points)}
          onChange={(next) => {
            setPoints(next === null ? "" : String(next));
          }}
          required
          min={0}
        />
      </Field>
      <Field label={t("category")}>
        <Input
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
          }}
          placeholder={t("categoryPlaceholder")}
          maxLength={100}
        />
      </Field>
      <label className="flex items-center gap-2 text-body-sm">
        <Checkbox
          checked={isActive}
          onCheckedChange={(v) => {
            setIsActive(v === true);
          }}
        />
        {t("active")}
      </label>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
