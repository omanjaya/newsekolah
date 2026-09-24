"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryCopyWrite, useCreateLibraryCopyMutation } from "../api";
import { useLibraryCatalogueOptionsQuery } from "../master-data-api";

const CONDITIONS: LibraryCopyWrite["condition"][] = ["good", "fair", "damaged", "lost"];

/** Adds one physical copy to a title. */
export function CopyForm({
  titleId,
  onDone,
}: {
  titleId: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.copies.form");
  const tCopies = useTranslations("app.library.copies");
  const tCondition = useTranslations("app.library.copies.condition");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryCopyMutation();
  const options = useLibraryCatalogueOptionsQuery();

  const [barcode, setBarcode] = useState("");
  const [condition, setCondition] = useState<LibraryCopyWrite["condition"]>("good");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [partnerId, setPartnerId] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            titleId,
            barcode: barcode.trim(),
            condition,
            notes: notes.trim() || undefined,
            category_id: categoryId || undefined,
            location_id: locationId || undefined,
            source_id: sourceId || undefined,
            partner_id: partnerId || undefined,
            is_opac: true,
          },
          {
            onSuccess: () => {
              toast.success(tCopies("form.saved"));
              onDone();
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("barcode")}</span>
        <Input
          value={barcode}
          onChange={(e) => {
            setBarcode(e.target.value);
          }}
          required
          maxLength={64}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("condition")}</span>
        <Select
          value={condition}
          onValueChange={(value) => {
            setCondition(value as LibraryCopyWrite["condition"]);
          }}
          options={CONDITIONS.map((value) => ({
            value: value as string,
            label: tCondition(value as string),
          }))}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("notes")}</span>
        <Input
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("category")}</span>
          <Select
            options={(options.data?.collection_categories ?? []).map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder={t("categoryPlaceholder")}
            disabled={options.isLoading}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("location")}</span>
          <Select
            options={(options.data?.locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
            value={locationId}
            onValueChange={setLocationId}
            placeholder={t("locationPlaceholder")}
            disabled={options.isLoading}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("source")}</span>
          <Select
            options={(options.data?.acquisition_sources ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            value={sourceId}
            onValueChange={setSourceId}
            placeholder={t("sourcePlaceholder")}
            disabled={options.isLoading}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("partner")}</span>
          <Select
            options={(options.data?.partners ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={partnerId}
            onValueChange={setPartnerId}
            placeholder={t("partnerPlaceholder")}
            disabled={options.isLoading}
          />
        </label>
      </div>
      <Button type="submit" loading={create.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
