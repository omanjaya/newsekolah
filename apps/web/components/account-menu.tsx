"use client";

import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetTrigger,
  cn,
} from "@newsekolah/ui";
import { ChevronDown, ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactElement } from "react";

import { useLogoutMutation } from "../features/auth/api";
import { filterNavigation, navigation, type NavItem } from "../lib/navigation";
import { navAccessFromMe } from "../lib/navigation-access";
import { forgetAccountOnThisBrowser } from "../lib/session/forget-account";
import { useSession } from "../lib/session/session-provider";
import { useTenant } from "../lib/tenant/tenant-provider";

import { ThemeMenuSegments, ThemeSwitch } from "./theme-toggle";
import { useIsDesktop } from "./use-is-desktop";

/** The reader's own pages, most used first; anything else marked `accountMenu` follows. */
const ACCOUNT_ORDER = [
  "profile",
  "check-in",
  "settings-security",
  "settings-notifications",
  "settings-appearance",
];

function useAccount() {
  const { me } = useSession();
  const { displayName, isLoading: brandingUnknown } = useTenant();
  const t = useTranslations("app.shell.account");
  const rank = (item: NavItem) => {
    const index = ACCOUNT_ORDER.indexOf(item.key);
    return index === -1 ? ACCOUNT_ORDER.length : index;
  };
  const items = filterNavigation(navigation, navAccessFromMe(me))
    .filter((item) => item.accountMenu)
    .sort((a, b) => rank(a) - rank(b));
  const role = me?.roles.find((entry) => entry.is_primary)?.name ?? me?.roles[0]?.name ?? "";
  const context = [
    // Never the product name in the school's place.
    brandingUnknown ? null : displayName,
    me?.current_class ? t("className", { name: me.current_class.name }) : null,
    me?.active_academic_year
      ? t("schoolYear", { label: me.active_academic_year.label })
      : t("noSchoolYear"),
  ].filter(Boolean);
  return { me, items, role, context: context.join(" · ") };
}

function useLogout() {
  const logoutMutation = useLogoutMutation();
  const router = useRouter();
  return async () => {
    // Before the request, so a sign-out that fails on the network still forgets.
    forgetAccountOnThisBrowser();
    await logoutMutation.mutateAsync();
    router.replace("/login");
  };
}

/**
 * The header's avatar: a round 44px avatar on a phone, the avatar with the
 * person's name and role from the `lg` breakpoint. Typed from the button's
 * own props so a menu or sheet trigger can pass its handlers through.
 */
const AccountTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & { name: string; role: string; avatarUrl?: string }
>(function AccountTrigger({ name, role, avatarUrl, className, ...props }, ref) {
  const t = useTranslations("app.shell");
  return (
    <button
      ref={ref}
      type="button"
      aria-label={t("profileMenu.label")}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-full motion-press",
        "md:h-10 md:rounded-md md:p-1 md:hover:bg-state-hover md:data-[state=open]:bg-state-hover lg:pr-2",
        className,
      )}
      {...props}
    >
      <Avatar
        name={name}
        src={avatarUrl}
        size={44}
        tone="accent"
        decorative
        className="md:hidden"
      />
      <Avatar
        name={name}
        src={avatarUrl}
        size={32}
        tone="accent"
        decorative
        className="hidden md:inline-flex"
      />
      {/* Room for a long name and role ("Wakil Kepala Sekolah ..."): the
          header has space to spare from lg up, where this text shows. */}
      <span className="hidden min-w-0 flex-col text-left lg:flex">
        <span className="max-w-40 truncate text-label text-fg lg:max-w-64">{name}</span>
        <span className="max-w-40 truncate text-caption text-fg-muted lg:max-w-64">{role}</span>
      </span>
      <ChevronDown aria-hidden="true" className="hidden size-4 shrink-0 text-fg-muted lg:block" />
    </button>
  );
});

/** Avatar, name, username and role, then the school and year in one quiet line. */
function Identity({
  name,
  username,
  role,
  context,
  avatarUrl,
}: {
  name: string;
  username: string;
  role: string;
  context: string;
  avatarUrl?: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} src={avatarUrl} size={40} tone="accent" decorative />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-label text-fg">{name}</span>
        <span className="truncate text-caption text-fg-muted">
          {[username, role].filter(Boolean).join(" · ")}
        </span>
        <span className="truncate text-caption text-fg-muted">{context}</span>
      </div>
    </div>
  );
}

/**
 * The account menu (docs/17-penyederhanaan-menu.md): who is signed in, the
 * reader's own pages, the theme, and signing out. A dropdown menu from the
 * `md` breakpoint, where it opens on the raised surface above the sticky
 * header; a bottom sheet on a phone, where the theme is a real segmented
 * control and every row is a 48px target.
 */
export function AccountMenu(): ReactElement {
  const desktop = useIsDesktop();
  const { me, items, role, context } = useAccount();
  const t = useTranslations();
  const tShell = useTranslations("app.shell");
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const name = me?.name ?? "";
  const trigger = <AccountTrigger name={name || "?"} role={role} avatarUrl={me?.avatar_url} />;

  if (desktop) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-76 p-1.5">
          <DropdownMenuLabel className="px-2.5 pt-2 pb-3">
            <Identity
              name={name}
              username={me?.username ?? ""}
              role={role}
              context={context}
              avatarUrl={me?.avatar_url}
            />
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.map((item) => (
            <DropdownMenuItem key={item.key} asChild icon={<item.icon />}>
              <Link href={item.href}>{t(item.labelKey)}</Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="pt-2 pb-1.5">{tShell("account.theme")}</DropdownMenuLabel>
          <ThemeMenuSegments />
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<LogOut />} onSelect={() => void logout()}>
            {tShell("profileMenu.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        title={name}
        description={[me?.username, role].filter(Boolean).join(" · ")}
        icon={<Avatar name={name || "?"} src={me?.avatar_url} size={44} tone="accent" decorative />}
        closeLabel={tShell("account.close")}
      >
        <div className="flex flex-col gap-5">
          <p className="text-body-sm text-fg-muted">{context}</p>
          <nav aria-label={tShell("profileMenu.label")}>
            <ul className="overflow-hidden rounded-lg bg-surface ring-1 ring-border">
              {items.map((item) => (
                <li key={item.key} className="border-b border-line last:border-b-0">
                  <Link
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                    }}
                    className="flex min-h-12 items-center gap-3 px-4 text-body text-fg transition-colors focus-visible:-outline-offset-2 active:bg-state-pressed"
                  >
                    <item.icon aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
                    <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col gap-2">
            <span className="text-label text-fg">{tShell("account.theme")}</span>
            <ThemeSwitch />
          </div>
          <Button variant="secondary" size="lg" icon={<LogOut />} onClick={() => void logout()}>
            {tShell("profileMenu.logout")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
