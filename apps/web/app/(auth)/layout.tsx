"use client";

import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { TenantBrand } from "../../components/tenant-brand";
import { initialsFor } from "../../lib/tenant/initials";
import { useTenant } from "../../lib/tenant/tenant-provider";

/**
 * Two-pane frame shared by every /(auth) page (login, change/forgot/reset
 * password): a solid accent brand panel in the school's own colour on the left
 * and the form on a bordered surface at the right, with the school's initials
 * set faint behind the panel as the only ornament. On narrow screens the panel
 * drops away and the brand sits above the card.
 */
export default function AuthLayout({ children }: { children: ReactNode }): ReactElement {
  const { displayName } = useTenant();
  const t = useTranslations("auth.login");
  const initials = initialsFor(displayName);

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[5fr_4fr]">
      <aside className="relative hidden overflow-hidden bg-accent px-12 py-14 text-accent-fg lg:flex lg:flex-col lg:justify-between xl:px-16">
        <BrandLockup name={displayName} />

        <div className="relative z-10 max-w-md">
          <p className="text-[24px] font-medium leading-snug">{t("panelHeadline")}</p>
          <p className="mt-3 text-[15px] leading-relaxed opacity-80">{t("panelTagline")}</p>
        </div>

        <p className="relative z-10 text-[13px] opacity-70">{t("panelFootnote")}</p>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -right-6 select-none text-[280px] font-semibold leading-none opacity-[0.06]"
        >
          {initials}
        </span>
      </aside>

      <main className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <TenantBrand />
          </div>
          <div className="rounded-sm border border-border bg-surface p-8 sm:p-10">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** Brand lockup for the accent panel: logo chip on a light plate, or the
 * school's initials, next to the name in the panel's foreground colour. */
function BrandLockup({ name }: { name: string }): ReactElement {
  const { branding } = useTenant();

  return (
    <div className="relative z-10 flex min-w-0 items-center gap-3">
      {branding?.logo_url ? (
        <img
          src={branding.logo_url}
          alt=""
          className="size-10 shrink-0 rounded-sm bg-surface object-contain p-1"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-sm bg-accent-fg/15 text-[15px] font-medium leading-none"
        >
          {initialsFor(name)}
        </span>
      )}
      <span className="truncate text-[16px] font-medium">{name}</span>
    </div>
  );
}
