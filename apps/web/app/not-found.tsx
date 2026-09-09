"use client";

import { Button, EmptyState } from "@newsekolah/ui";
import { Compass } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export default function NotFound(): ReactElement {
  const t = useTranslations("app.notFound");

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<Compass aria-hidden="true" />}
        title={t("title")}
        description={t("body")}
        action={
          <Button asChild>
            <Link href="/dashboard">{t("backHome")}</Link>
          </Button>
        }
      />
    </div>
  );
}
