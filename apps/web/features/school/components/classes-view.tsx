"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Skeleton,
  domainIcons,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery } from "../../reference/api";

import { CLASS_TABS, ClassDetail } from "./class-detail";
import { ClassForm } from "./class-form";
import { ClassNavigation } from "./class-navigation";

/** Class list on the left, the selected class's students and teachers on the right. */
export function ClassesView(): ReactElement {
  const t = useTranslations("app.school.classes");
  const tApp = useTranslations("app");
  const year = useActiveYear();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_master_data");
  const classes = useClassesQuery();
  const [creating, setCreating] = useState(false);
  const items = useMemo(
    () =>
      [...(classes.data?.data ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [classes.data],
  );
  const classIds = items.map((item) => item.id);
  const [selectedId, setSelectedId, replaceSelectedId] = useUrlState(
    "class",
    classIds,
    classIds[0] ?? "",
  );
  const [selectedTab, setSelectedTab] = useUrlState("tab", CLASS_TABS, "students");
  const selected = items.find((c) => c.id === selectedId) ?? items[0];

  useEffect(() => {
    if (selected) replaceSelectedId(selected.id);
  }, [replaceSelectedId, selected]);

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the class list and the roster scroll internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setCreating(true);
              }}
            >
              {t("addClass")}
            </Button>
          )
        }
      />
      {classes.isLoading ? (
        <Skeleton className="h-96 w-full" aria-busy="true" />
      ) : classes.isError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-sm border border-border p-4">
          <p className="text-[13px] text-fg-muted">
            {classes.error instanceof ApiError
              ? apiErrorMessage(classes.error.code)
              : tApp("error.body")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => {
              void classes.refetch();
            }}
          >
            {tApp("offlinePage.retry")}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="grid min-w-0 gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <ClassNavigation items={items} selectedId={selected?.id} onSelect={setSelectedId} />
          {selected && (
            <ClassDetail
              key={selected.id}
              cls={selected}
              canManage={canManage}
              tab={selectedTab}
              onTabChange={setSelectedTab}
            />
          )}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("addClass")}>
          {creating && (
            <ClassForm
              yearId={year.id}
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
