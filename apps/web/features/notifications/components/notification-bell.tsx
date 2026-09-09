"use client";

import { IconButton } from "@newsekolah/ui";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useUnreadCountQuery } from "../api";

/** Header bell: unread badge from the inbox count, opens /notifications. */
export function NotificationBell(): ReactElement {
  const t = useTranslations("app.notifications");
  const router = useRouter();
  const { status } = useSession();
  const { data } = useUnreadCountQuery(status === "authenticated");
  const count = data?.count ?? 0;
  const label = count > 0 ? t("bellUnread", { count }) : t("bellLabel");

  return (
    <span className="relative inline-flex">
      <IconButton
        icon={<Bell />}
        aria-label={label}
        title={label}
        onClick={() => {
          router.push("/notifications");
        }}
      />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-accent px-1 text-[10px] font-semibold text-accent-fg"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );
}
