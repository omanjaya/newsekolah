"use client";

import { Button, StatePage } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../lib/session/session-provider";

import { HistoryBackButton } from "./history-back-button";

/**
 * The 404 state: home for someone signed in, the sign-in page for a
 * visitor, and the previous page when there is one. Renders in whatever
 * frame holds it (the public frame at the root; the app shell once
 * `(app)` has its own not-found page).
 */
export function NotFoundState(): ReactElement {
  const t = useTranslations("app.notFound");
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <StatePage
      kind="not-found"
      title={t("title")}
      description={t("body")}
      code="404"
      action={
        <Button asChild>
          <Link href={signedIn ? "/dashboard" : "/login"}>
            {signedIn ? t("backHome") : t("signIn")}
          </Link>
        </Button>
      }
      secondaryAction={<HistoryBackButton label={t("back")} />}
    />
  );
}
