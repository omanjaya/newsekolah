"use client";

import { Button, PageShell, StatePage } from "@newsekolah/ui";
import { House, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useCommandPalette } from "../../components/command-palette-provider";
import { useDocumentTitle } from "../../lib/page-title";

/**
 * A wrong address inside the app, shown in the shell (audit
 * shell-auth-public-11): the reader keeps the sidebar and the header, and
 * gets the two ways forward, home or the page search.
 */
export default function AppNotFound(): ReactElement {
  const t = useTranslations("app.notFound");
  const tPage = useTranslations("app.page.notFound");
  const palette = useCommandPalette();
  useDocumentTitle(t("title"));

  return (
    <PageShell>
      <StatePage
        kind="not-found"
        title={t("title")}
        description={t("body")}
        code="404"
        action={
          <Button asChild icon={<House />}>
            <Link href="/dashboard">{t("backHome")}</Link>
          </Button>
        }
        secondaryAction={
          <Button variant="secondary" icon={<Search />} onClick={palette.open}>
            {tPage("search")}
          </Button>
        }
      />
    </PageShell>
  );
}
