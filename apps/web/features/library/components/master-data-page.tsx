"use client";

import { SkeletonList } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { AppPage } from "../../../components/app-page";
import { useCan } from "../../../lib/session/session-provider";

import { LibraryWorkspaceNav } from "./library-workspace-nav";
import { MasterDataView } from "./master-data-view";

/**
 * `/library/master-data`. Whoever manages library settings edits catalogue
 * data in the settings hub, so the old address takes them there (keeping
 * the list they had open); a catalogue reader without that permission
 * cannot open the hub and keeps this page to look the data up.
 */
export function MasterDataPage(): ReactElement {
  const t = useTranslations("app.library.masterData");
  const canSettings = useCan("manage_library_settings");
  const router = useRouter();

  useEffect(() => {
    if (!canSettings) return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    router.replace(
      `/library/settings?section=masterData${tab ? `&tab=${encodeURIComponent(tab)}` : ""}`,
    );
  }, [canSettings, router]);

  if (canSettings) {
    return (
      <AppPage title={t("title")} nav={false}>
        <SkeletonList rows={4} framed />
      </AppPage>
    );
  }
  return (
    <AppPage title={t("title")} nav={<LibraryWorkspaceNav area="catalogue" />}>
      <MasterDataView />
    </AppPage>
  );
}
