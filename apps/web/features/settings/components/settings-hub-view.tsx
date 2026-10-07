"use client";

import { Card, EmptyState, PageHeader, SearchInput } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { buildSettingsHubSections } from "../settings-hub";

/** Landing page that groups every settings sub-page the reader may open. */
export function SettingsHubView(): ReactElement {
  const t = useTranslations();
  const { me } = useSession();
  const [query, setQuery] = useState("");

  const permissions = me?.permissions;
  const profileKind = me?.profile_kind;
  const roles = me?.roles;
  const { all, filtered } = useMemo(() => {
    const translate = (key: string): string => t(key);
    const can = (permission: string) => permissions?.includes(permission) ?? false;
    const roleSlugs = (roles ?? []).map((role) => role.slug);
    const base = { can, profileKind, roleSlugs, translate };
    return {
      all: buildSettingsHubSections(base),
      filtered: buildSettingsHubSections({ ...base, query }),
    };
  }, [permissions, profileKind, roles, query, t]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("app.settingsHub.eyebrow")} title={t("app.settingsHub.title")} />
      {all.length === 0 ? (
        <EmptyState
          title={t("app.settingsHub.noAccessTitle")}
          description={t("app.settingsHub.noAccessDescription")}
        />
      ) : (
        <>
          <SearchInput
            className="max-w-md"
            aria-label={t("app.settingsHub.searchLabel")}
            placeholder={t("app.settingsHub.searchPlaceholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {filtered.length === 0 ? (
            <EmptyState
              title={t("app.settingsHub.emptyTitle")}
              description={t("app.settingsHub.emptyDescription")}
            />
          ) : (
            filtered.map((section) => (
              <section key={section.key} className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-heading text-[16px] font-bold text-fg">
                    {t(`app.settingsHub.sections.${section.key}.title`)}
                  </h2>
                  <p className="text-[13px] text-fg-muted">
                    {t(`app.settingsHub.sections.${section.key}.description`)}
                  </p>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {section.cards.map((card) => (
                    <li key={card.key}>
                      <Card className="h-full transition-colors focus-within:border-accent hover:border-accent">
                        <Link
                          href={card.href}
                          className="flex h-full items-start gap-3 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <span
                            aria-hidden="true"
                            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg"
                          >
                            <card.icon className="size-5" />
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[14px] font-semibold text-fg">{card.label}</span>
                            <span className="text-[13px] text-fg-muted">{card.description}</span>
                          </span>
                        </Link>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
