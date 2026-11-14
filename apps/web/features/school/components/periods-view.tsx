"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  SkeletonList,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useDeletePeriodTemplateMutation,
  useUpdatePeriodTemplateMutation,
} from "../../academic/api-school-extras";
import {
  type PeriodTemplate,
  useCreatePeriodTemplateMutation,
  usePeriodTemplatesQuery,
} from "../api";

import { PeriodTable } from "./period-table";
import { WeekPanel } from "./week-panel";

export function PeriodsView(): ReactElement {
  const t = useTranslations("app.school.periods");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const templates = usePeriodTemplatesQuery();
  const [templateId, setTemplateId] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const createTemplate = useCreatePeriodTemplateMutation();
  const updateTemplate = useUpdatePeriodTemplateMutation();
  const deleteTemplate = useDeletePeriodTemplateMutation();
  const list = templates.data?.data ?? [];
  const selected =
    list.find((x) => x.id === templateId) ?? list.find((x) => x.is_default) ?? list[0];

  const [renaming, setRenaming] = useState<PeriodTemplate | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PeriodTemplate | null>(null);

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  return (
    // md:h-full: fills the tab panel's height; the periods/week grid below
    // the fixed template row scrolls internally.
    <div className="flex min-w-0 flex-col gap-4 md:h-full md:min-h-0">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("template")}>
          <Select
            options={list.map((x) => ({
              value: x.id,
              label: x.is_default ? `${x.name} (${t("default")})` : x.name,
            }))}
            value={selected?.id ?? ""}
            onValueChange={setTemplateId}
            className="w-full sm:w-64"
            placeholder={t("noTemplate")}
          />
        </Field>
        {selected && (
          <div className="flex gap-1">
            <IconButton
              icon={<Pencil />}
              aria-label={t("renameTemplate")}
              onClick={() => {
                setRenaming(selected);
                setRenameValue(selected.name);
              }}
            />
            <IconButton
              icon={<Trash2 />}
              aria-label={t("deleteTemplate")}
              onClick={() => {
                setPendingDelete(selected);
              }}
            />
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus />}
          onClick={() => {
            setNewTemplate("");
            setTemplateOpen(true);
          }}
        >
          {t("addTemplate")}
        </Button>
      </div>
      {templates.isLoading ? (
        <SkeletonList rows={6} framed />
      ) : selected ? (
        <div className="grid gap-6 md:min-h-0 md:flex-1 md:overflow-y-auto xl:grid-cols-[minmax(0,1fr)_360px]">
          <PeriodTable templateId={selected.id} />
          <WeekPanel templateId={selected.id} />
        </div>
      ) : (
        <EmptyState
          icon={<domainIcons.schedule aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      )}

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent title={t("newTemplate")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTemplate.trim()) return;
              createTemplate.mutate(
                { name: newTemplate.trim(), is_default: list.length === 0 },
                {
                  onSuccess: () => {
                    setNewTemplate("");
                    setTemplateOpen(false);
                    toast.success(t("templateCreated"));
                  },
                  onError: fail,
                },
              );
            }}
          >
            <Field label={t("newTemplate")}>
              <Input
                value={newTemplate}
                onChange={(e) => {
                  setNewTemplate(e.target.value);
                }}
                placeholder={t("newTemplatePlaceholder")}
                required
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setTemplateOpen(false);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" loading={createTemplate.isPending}>
                {t("addTemplate")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent title={t("renameTemplate")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!renaming || !renameValue.trim()) return;
              updateTemplate.mutate(
                {
                  id: renaming.id,
                  body: { name: renameValue.trim(), is_default: renaming.is_default },
                },
                {
                  onSuccess: () => {
                    toast.success(t("templateUpdated"));
                    setRenaming(null);
                  },
                  onError: fail,
                },
              );
            }}
          >
            <Field label={t("newTemplate")}>
              <Input
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                }}
                required
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRenaming(null);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" loading={updateTemplate.isPending}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTemplateTitle")}
        description={pendingDelete ? t("deleteTemplateBody", { name: pendingDelete.name }) : ""}
        confirmLabel={t("delete")}
        destructive
        confirming={deleteTemplate.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteTemplate.mutateAsync(pendingDelete.id);
            toast.success(t("templateDeleted"));
            if (templateId === pendingDelete.id) setTemplateId("");
          } catch (error) {
            fail(error);
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
