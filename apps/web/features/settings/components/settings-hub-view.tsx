"use client";

import {
  Card,
  EmptyState,
  FilteredEmptyState,
  IconCircle,
  SearchInput,
  SectionHeader,
  type CategoryTone,
} from "@newsekolah/ui";
import { ChevronRight, Settings } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { useSession } from "../../../lib/session/session-provider";
import { buildSettingsHubSections, type SettingsHubSectionKey } from "../settings-hub";

/** One topic hue per section, so a card's icon says which group it belongs to. */
const SECTION_TONE: Record<SettingsHubSectionKey, CategoryTone | "neutral"> = {
  identity: "green",
  access: "blue",
  communication: "amber",
  workflow: "purple",
  account: "neutral",
};

/** Landing page that groups every settings sub-page the reader may open. */
export function SettingsHubView(): ReactElement {
  const t = useTranslations();
  const { me } = useSession();
  const [query, setQuery] = useState("");

  const { all, filtered } = useMemo(() => {
    const translate = (key: string): string => t(key);
    const base = { access: navAccessFromMe(me), translate };
    return {
      all: buildSettingsHubSections(base),
      filtered: buildSettingsHubSections({ ...base, query }),
    };
  }, [me, query, t]);

  return (
    // A narrow column: the hub is read top to bottom, like the settings
    // pages it leads to. Eyebrow and title come from the navigation registry.
    <AppPage variant="narrow" nav={false} description={t("app.settingsHub.description")}>
      {all.length === 0 ? (
        <EmptyState
          icon={<Settings aria-hidden="true" />}
          title={t("app.settingsHub.noAccessTitle")}
          description={t("app.settingsHub.noAccessDescription")}
        />
      ) : (
        <>
          <SearchInput
            className="sm:max-w-sm"
            aria-label={t("app.settingsHub.searchLabel")}
            placeholder={t("app.settingsHub.searchPlaceholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {filtered.length === 0 ? (
            <FilteredEmptyState
              title={t("app.settingsHub.emptyTitle")}
              description={t("app.settingsHub.emptyDescription")}
              onReset={() => {
                setQuery("");
              }}
            />
          ) : (
            filtered.map((section) => {
              const titleId = `settings-hub-${section.key}`;
              return (
                <section
                  key={section.key}
                  aria-labelledby={titleId}
                  className="flex flex-col gap-3"
                >
                  <SectionHeader
                    titleId={titleId}
                    title={t(`app.settingsHub.sections.${section.key}.title`)}
                    description={t(`app.settingsHub.sections.${section.key}.description`)}
                  />
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {section.cards.map((card) => (
                      <li key={card.key} className="flex">
                        <Card interactive asChild>
                          <Link href={card.href} className="flex w-full items-start gap-3 p-4">
                            <IconCircle tone={SECTION_TONE[section.key]}>
                              <card.icon />
                            </IconCircle>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                              <span className="text-label text-fg">{card.label}</span>
                              <span className="text-body-sm text-fg-muted">{card.description}</span>
                            </span>
                            <ChevronRight
                              aria-hidden="true"
                              className="mt-2.5 size-4 shrink-0 text-fg-muted"
                            />
                          </Link>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </>
      )}
    </AppPage>
  );
}
