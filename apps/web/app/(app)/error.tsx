"use client";

import { Button, PageShell, StatePage } from "@newsekolah/ui";
import { House, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition, useEffect, type ReactElement } from "react";

import { useDocumentTitle } from "../../lib/page-title";

/**
 * A page that throws while rendering is replaced by this, inside the app
 * shell: the sidebar, header and search stay, so one broken screen never
 * blanks the whole app (audit shell-auth-public-11). "Coba lagi" refetches
 * the route's server part and re-renders the page; the digest is the code
 * support can look up in the server log.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  const t = useTranslations("app.page.error");
  const router = useRouter();
  useDocumentTitle(t("title"));

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <StatePage
        kind="error"
        title={t("title")}
        description={t("body")}
        code={error.digest}
        action={
          <Button
            icon={<RotateCw />}
            onClick={() => {
              startTransition(() => {
                router.refresh();
                reset();
              });
            }}
          >
            {t("retry")}
          </Button>
        }
        secondaryAction={
          <Button asChild variant="secondary" icon={<House />}>
            <Link href="/dashboard">{t("home")}</Link>
          </Button>
        }
      />
    </PageShell>
  );
}
