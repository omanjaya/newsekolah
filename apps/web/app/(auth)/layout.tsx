"use client";

import { BookOpen, CalendarCheck, GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactElement, ReactNode } from "react";

import { TenantBrand } from "../../components/tenant-brand";
import { initialsFor } from "../../lib/tenant/initials";
import { useTenant } from "../../lib/tenant/tenant-provider";

/**
 * Two-pane frame shared by every /(auth) page (login, change/forgot/reset
 * password). The left pane is a gradient brand hero in the school's accent
 * colour with slow-drifting orbs, a value-proposition list, and the school's
 * initials set faint behind it; the right pane holds the form on an elevated
 * card. On narrow screens the hero drops away and the brand sits above the card.
 */
export default function AuthLayout({ children }: { children: ReactNode }): ReactElement {
  const { displayName } = useTenant();
  const t = useTranslations("auth.login");
  const initials = initialsFor(displayName);

  const features: { icon: ComponentType<{ className?: string }>; label: string }[] = [
    { icon: CalendarCheck, label: t("featureAttendance") },
    { icon: GraduationCap, label: t("featureGrades") },
    { icon: BookOpen, label: t("featureLibrary") },
  ];

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[5fr_4fr]">
      <aside
        className="relative hidden overflow-hidden px-12 py-14 text-accent-fg lg:flex lg:flex-col lg:justify-between xl:px-16"
        style={{
          backgroundImage:
            "linear-gradient(150deg, color-mix(in oklab, var(--color-accent), white 8%) 0%, var(--color-accent) 42%, color-mix(in oklab, var(--color-accent), black 48%) 100%)",
        }}
      >
        {/* Drifting light orbs for depth. */}
        <div
          aria-hidden="true"
          className="auth-orb-a pointer-events-none absolute -left-24 -top-24 size-[26rem] rounded-full opacity-40 blur-3xl"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklab, var(--color-accent), white 55%), transparent 68%)",
          }}
        />
        <div
          aria-hidden="true"
          className="auth-orb-b pointer-events-none absolute -bottom-28 right-[-6rem] size-[30rem] rounded-full opacity-30 blur-3xl"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklab, var(--color-accent), black 15%), transparent 70%)",
          }}
        />
        {/* Fine dot grid, faded out toward the edges. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(ellipse at center, black, transparent 78%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black, transparent 78%)",
          }}
        />

        <BrandLockup name={displayName} />

        <div className="relative z-10 max-w-md">
          <p className="text-[30px] font-semibold leading-[1.15] tracking-tight">
            {t("panelHeadline")}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed opacity-80">{t("panelTagline")}</p>

          <ul className="mt-9 flex flex-col gap-4">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-accent-fg/10 ring-1 ring-inset ring-accent-fg/15">
                  <Icon className="size-[18px]" />
                </span>
                <span className="text-[14px] opacity-90">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-[13px] opacity-70">{t("panelFootnote")}</p>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -right-6 z-0 select-none text-[280px] font-bold leading-none opacity-[0.06]"
        >
          {initials}
        </span>
      </aside>

      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-12">
        {/* Faint accent glow so the plain side is not entirely flat. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-0 size-[24rem] rounded-full opacity-[0.06] blur-3xl"
          style={{ backgroundColor: "var(--color-accent)" }}
        />
        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <TenantBrand />
          </div>
          <div className="rounded-xl border border-border bg-surface p-8 shadow-[0_24px_70px_-32px_rgba(0,0,0,0.35)] sm:p-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Brand lockup for the accent hero: logo chip on a light plate, or the
 * school's initials, next to the name in the hero's foreground colour. */
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
          className="grid size-10 shrink-0 place-items-center rounded-sm bg-accent-fg/15 text-[15px] font-medium leading-none ring-1 ring-inset ring-accent-fg/20"
        >
          {initialsFor(name)}
        </span>
      )}
      <span className="truncate text-[16px] font-medium tracking-tight">{name}</span>
    </div>
  );
}
