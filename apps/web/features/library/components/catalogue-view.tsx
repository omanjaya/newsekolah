"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageHeader,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryTitle, useCreateLibraryTitleMutation, useLibraryTitlesQuery } from "../api";
import type { LibraryExternalBibliography } from "../isbn-lookup-api";

import { IsbnLookupPanel } from "./isbn-lookup-panel";

export function CatalogueView(): ReactElement {
  const t = useTranslations("app.library.catalogue");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useLibraryTitlesQuery(search);
  const titles = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryTitle>[]>(
    () => [
      { accessorKey: "title", header: t("columns.title"), enableSorting: false },
      { accessorKey: "author", header: t("columns.author"), enableSorting: false },
      {
        accessorKey: "classification",
        header: t("columns.classification"),
        enableSorting: false,
        cell: ({ row }) => row.original.classification || "-",
      },
      {
        id: "copies",
        header: t("columns.copies"),
        enableSorting: false,
        cell: ({ row }) =>
          t("copiesAvailable", {
            available: row.original.available_copies,
            total: row.original.total_copies,
          }),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/library/catalogue/${row.original.id}`}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            {t("viewCopies")}
          </Link>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href="/library/copies">{t("browseCopies")}</Link>
        </Button>
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            setAdding(true);
          }}
        >
          {t("addTitle")}
        </Button>
      </div>

      <DataTable
        data={titles}
        columns={columns}
        rowCount={titles.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
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
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
        }}
      >
        <DialogContent title={t("addTitle")}>
          <TitleForm
            onDone={() => {
              setAdding(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TitleForm({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.library.catalogue.form");
  const tCatalogue = useTranslations("app.library.catalogue");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryTitleMutation();

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState("");
  const [additionalAuthors, setAdditionalAuthors] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishPlace, setPublishPlace] = useState("");
  const [publishYear, setPublishYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [classification, setClassification] = useState("");
  const [pages, setPages] = useState("");
  const [subjects, setSubjects] = useState("");
  const [language, setLanguage] = useState("");
  const [abstract, setAbstract] = useState("");
  const [coverAssetId, setCoverAssetId] = useState("");

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
        create.mutate(
          {
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
            is_opac: true,
          },
          {
            onSuccess: () => {
              toast.success(tCatalogue("form.saved"));
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
      <Button type="submit" loading={create.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
