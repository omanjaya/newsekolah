"use client";

import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  SkeletonList,
  domainIcons,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery } from "../../reference/api";

import { CLASS_TABS, ClassDetail } from "./class-detail";
import { ClassForm } from "./class-form";
import { ClassNavigation } from "./class-navigation";

/** Class list on the left, the selected class's students and teachers on the right. */
export function ClassesView(): ReactElement {
  const t = useTranslations("app.school.classes");
  const year = useActiveYear();
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

  const addButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t("addClass")}
    </Button>
  );

  return (
    // Viewport-fit on desktop: the page itself never scrolls; the class list
    // and the roster scroll internally. The enrollment import is a tab of
    // this area (navigation registry), so it is not repeated as a button.
    <AppPage variant="fit" primaryAction={canManage ? addButton : undefined}>
      {classes.isLoading ? (
        <div
          aria-busy="true"
          className="grid min-w-0 gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,248px)_minmax(0,1fr)]"
        >
          <SkeletonList rows={6} framed className="max-md:hidden" />
          <SkeletonList rows={8} leading framed />
        </div>
      ) : classes.isError ? (
        <QueryError retry={() => void classes.refetch()} error={classes.error} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={canManage ? t("emptyBody") : t("emptyBodyReader")}
          action={canManage ? addButton : undefined}
        />
      ) : (
        <div className="grid min-w-0 gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,248px)_minmax(0,1fr)]">
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
        <DialogContent title={t("addClass")} size="md">
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
    </AppPage>
  );
}
