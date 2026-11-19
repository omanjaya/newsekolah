"use client";

import { Alert, Button, HeroCard, Progress, TextLink } from "@newsekolah/ui";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, type ReactElement } from "react";

import { useFocusAfterRetry } from "../../../lib/hooks/use-focus-after-retry";
import { entrance } from "../home/entrance";
import { isHeroLink, type ShownHero } from "../home/types";

/** Where the home's one retry sits, or `null` while every read loaded. */
export type RetryAt = "hero" | "notice" | null;

/**
 * The hero and, when a read failed under an urgent hero that stayed, the
 * notice that says so with the home's one retry. Keeps keyboard focus here
 * once a retry replaces the button it was on.
 */
export function HomeTop({
  hero,
  retryAt,
  retrying,
  onRetry,
  enter,
}: {
  hero: ShownHero;
  retryAt: RetryAt;
  retrying: boolean;
  onRetry: () => void;
  enter: boolean;
}): ReactElement {
  const t = useTranslations("app.dashboard");
  const region = useRef<HTMLDivElement>(null);
  const keepFocus = useFocusAfterRetry(region, retrying, retryAt);
  const retry = () => {
    keepFocus();
    onRetry();
  };
  const shown =
    hero.action && !isHeroLink(hero.action)
      ? { ...hero, action: { ...hero.action, onClick: retry } }
      : hero;
  return (
    <div ref={region} className="flex flex-col gap-4">
      <HomeHero hero={shown} enter={enter} />
      {retryAt === "notice" && (
        <Alert
          tone="warning"
          title={t("failed.title")}
          data-testid="dashboard-failed-notice"
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCw />}
              loading={retrying}
              onClick={retry}
              data-retry-focus=""
            >
              {t("failed.action")}
            </Button>
          }
        >
          <p>{t("failed.meta")}</p>
        </Alert>
      )}
    </div>
  );
}

function HomeHero({ hero, enter }: { hero: ShownHero; enter: boolean }): ReactElement {
  return (
    <HeroCard
      {...entrance(enter, 0)}
      data-testid="dashboard-hero"
      tone={hero.tone}
      eyebrow={hero.eyebrow}
      title={hero.title}
      meta={hero.meta}
      chip={hero.chip}
      live={hero.live}
      action={
        hero.action &&
        (isHeroLink(hero.action) ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href={hero.action.href}>{hero.action.label}</Link>
          </Button>
        ) : (
          <Button
            className="w-full sm:w-auto"
            icon={<RotateCw />}
            loading={hero.action.loading}
            onClick={hero.action.onClick}
            data-retry-focus=""
          >
            {hero.action.label}
          </Button>
        ))
      }
      secondaryAction={
        hero.secondaryAction && (
          <TextLink href={hero.secondaryAction.href}>{hero.secondaryAction.label}</TextLink>
        )
      }
    >
      {hero.progress && (
        <Progress
          className="mt-1"
          variant="meter"
          value={hero.progress.value}
          max={hero.progress.max}
          label={hero.progress.label}
          valueLabel={hero.progress.valueLabel}
        />
      )}
    </HeroCard>
  );
}
