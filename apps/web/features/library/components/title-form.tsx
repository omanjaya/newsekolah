"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryTitle,
  type LibraryTitleWrite,
  useCreateLibraryTitleMutation,
  useUpdateLibraryTitleMutation,
} from "../api";
import type { LibraryExternalBibliography } from "../isbn-lookup-api";
import { useLibraryCatalogueOptionsQuery } from "../master-data-api";

import { DuplicateTitleWarning } from "./duplicate-title-warning";
import { IsbnLookupPanel } from "./isbn-lookup-panel";

export function TitleForm({
  initial,
  onDone,
}: {
  initial?: LibraryTitle;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.catalogue.form");
  const tCatalogue = useTranslations("app.library.catalogue");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryTitleMutation();
  const update = useUpdateLibraryTitleMutation();
  const options = useLibraryCatalogueOptionsQuery();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [additionalAuthors, setAdditionalAuthors] = useState(initial?.additional_authors ?? "");
  const [publisher, setPublisher] = useState(initial?.publisher ?? "");
  const [publishPlace, setPublishPlace] = useState(initial?.publish_place ?? "");
  const [publishYear, setPublishYear] = useState(
    initial?.publish_year ? String(initial.publish_year) : "",
  );
  const [isbn, setIsbn] = useState(initial?.isbn ?? "");
  const [classification, setClassification] = useState(initial?.classification ?? "");
  const [pages, setPages] = useState(initial?.pages ?? "");
  const [subjects, setSubjects] = useState(initial?.subjects ?? "");
  const [language, setLanguage] = useState(initial?.language ?? "");
  const [abstract, setAbstract] = useState(initial?.abstract ?? "");
  const [coverAssetId, setCoverAssetId] = useState(initial?.cover_asset_id ?? "");
  const [materialTypeId, setMaterialTypeId] = useState(initial?.material_type_id ?? "");

  function applyLookup(bibliography: LibraryExternalBibliography) {
    setTitle(bibliography.title);
    if (bibliography.subtitle) setSubtitle(bibliography.subtitle);
    if (bibliography.main_author) setAuthor(bibliography.main_author);
    if (bibliography.additional_authors) setAdditionalAuthors(bibliography.additional_authors);
    if (bibliography.publisher) setPublisher(bibliography.publisher);
    if (bibliography.publish_place) setPublishPlace(bibliography.publish_place);
    if (bibliography.publish_year) setPublishYear(String(bibliography.publish_year));
    if (bibliography.pages) setPages(bibliography.pages);
    if (bibliography.subjects) setSubjects(bibliography.subjects);
    if (bibliography.language) setLanguage(bibliography.language);
    if (bibliography.abstract) setAbstract(bibliography.abstract);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body: LibraryTitleWrite = {
          control_number: initial?.control_number,
          responsibility: initial?.responsibility,
          edition: initial?.edition,
          illustration: initial?.illustration,
          dimensions: initial?.dimensions,
          issn: initial?.issn,
          ddc_number: initial?.ddc_number,
          call_number: initial?.call_number,
          literary_form: initial?.literary_form,
          target_audience: initial?.target_audience,
          notes: initial?.notes,

          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          author: author.trim() || undefined,
          additional_authors: additionalAuthors.trim() || undefined,
          publisher: publisher.trim() || undefined,
          publish_place: publishPlace.trim() || undefined,
          publish_year: publishYear ? Number(publishYear) : undefined,
          isbn: isbn.trim() || undefined,
          classification: classification.trim() || undefined,
          pages: pages.trim() || undefined,
          subjects: subjects.trim() || undefined,
          language: language.trim() || undefined,
          abstract: abstract.trim() || undefined,
          cover_asset_id: coverAssetId || undefined,
          material_type_id: materialTypeId || undefined,
          is_opac: initial?.is_opac ?? true,
        };
        const callbacks = {
          onSuccess: () => {
            toast.success(tCatalogue("form.saved"));
            onDone();
          },
          onError: (error: unknown) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        };
        if (initial) update.mutate({ ...body, titleId: initial.id }, callbacks);
        else create.mutate(body, callbacks);
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("title")}</span>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          required
          maxLength={300}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("subtitle")}</span>
        <Input
          value={subtitle}
          onChange={(e) => {
            setSubtitle(e.target.value);
          }}
          maxLength={300}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("author")}</span>
        <Input
          value={author}
          onChange={(e) => {
            setAuthor(e.target.value);
          }}
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("publisher")}</span>
        <Input
          value={publisher}
          onChange={(e) => {
            setPublisher(e.target.value);
          }}
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("publishYear")}</span>
        <Input
          type="number"
          value={publishYear}
          onChange={(e) => {
            setPublishYear(e.target.value);
          }}
          min={1000}
          max={3000}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("isbn")}</span>
        <Input
          value={isbn}
          onChange={(e) => {
            setIsbn(e.target.value);
          }}
          maxLength={32}
        />
      </label>
      {isbn !== initial?.isbn && <DuplicateTitleWarning isbn={isbn} />}
      <IsbnLookupPanel isbn={isbn} onApply={applyLookup} onCoverImported={setCoverAssetId} />
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("classification")}</span>
        <Input
          value={classification}
          onChange={(e) => {
            setClassification(e.target.value);
          }}
          maxLength={60}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("materialType")}</span>
        <Select
          options={(options.data?.material_types ?? []).map((mt) => ({
            value: mt.id,
            label: mt.name,
          }))}
          value={materialTypeId}
          onValueChange={setMaterialTypeId}
          placeholder={t("materialTypePlaceholder")}
          disabled={options.isLoading}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("additionalAuthors")}</span>
        <Input
          value={additionalAuthors}
          onChange={(e) => {
            setAdditionalAuthors(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("publishPlace")}</span>
        <Input
          value={publishPlace}
          onChange={(e) => {
            setPublishPlace(e.target.value);
          }}
          maxLength={120}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("pages")}</span>
        <Input
          value={pages}
          onChange={(e) => {
            setPages(e.target.value);
          }}
          maxLength={60}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("subjects")}</span>
        <Input
          value={subjects}
          onChange={(e) => {
            setSubjects(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("language")}</span>
        <Input
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
          }}
          maxLength={10}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("abstract")}</span>
        <Textarea
          value={abstract}
          onChange={(e) => {
            setAbstract(e.target.value);
          }}
          rows={3}
          maxLength={2000}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          loading={create.isPending || update.isPending}
          disabled={!title.trim()}
        >
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
