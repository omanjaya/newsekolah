"use client";

import { EmptyState } from "@newsekolah/ui";
import { Compass } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { LinkButton } from "../components/link-button";

export default function NotFound(): ReactElement {
  const t = useTranslations("app.notFound");

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<Compass aria-hidden="true" />}
        title={t("title")}
        description={t("body")}
        action={
          <LinkButton href="/dashboard" variant="primary">
            {t("backHome")}
          </LinkButton>
        }
      />
    </div>
  );
}
