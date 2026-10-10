"use client";

import { domainIcons, type CommandPaletteGroup } from "@newsekolah/ui";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { studentProfileHref } from "../features/students/href";
import { usePaletteStudentGroup } from "../features/students/lib/use-palette-student-group";
import { groupNavigation } from "../lib/group-navigation";
import { navigation, filterNavigation } from "../lib/navigation";
import { confirmUnsavedChangesBeforeNavigation } from "../lib/navigation/use-unsaved-changes-protection";
import { canOpenPath } from "../lib/navigation-permissions";
import { consolidateNavigation } from "../lib/navigation-workspaces";
import { quickActionHref } from "../lib/quick-actions";
import { useSession } from "../lib/session/session-provider";
import { useQuickActions } from "../lib/use-quick-actions";

interface CommandPaletteContextValue {
  open: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

// The provider itself (context + Ctrl/Cmd+K listener) must mount with the
// shell so the shortcut always works, but the palette dialog carries cmdk,
// which no route needs for first paint (docs/16-audit-performa-web.md item
// 8). Deferring only the dialog keeps the shell's initial chunk free of it
// without gating the whole shell behind a client-only chunk.
const CommandPalette = dynamic(() => import("@newsekolah/ui").then((mod) => mod.CommandPalette), {
  ssr: false,
});

/**
 * Global Ctrl/Cmd+K search (docs/07-ui-ux.md section 2). Wired to the same
 * `navigation` registry as the sidebar and tab bar, filtered by the same
 * permissions, so it can never offer a page the user cannot open.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  // The dialog (and its chunk) loads on the first open, not on shell mount.
  const [hasOpened, setHasOpened] = useState(false);
  const router = useRouter();
  const { me } = useSession();
  const t = useTranslations("app.shell.commandPalette");
  const tQuick = useTranslations("app.quickActions");
  const tNav = useTranslations();
  const quickActions = useQuickActions();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setHasOpened(true);
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const pageGroups: CommandPaletteGroup[] = useMemo(() => {
    const can = (permission: string) => me?.permissions.includes(permission) ?? false;
    const authorizedItems = filterNavigation(
      navigation,
      can,
      me?.profile_kind,
      (me?.roles ?? []).map((role) => role.slug),
    );
    const workspaces = consolidateNavigation(authorizedItems, {
      profileKind: me?.profile_kind,
      duties: me?.duties,
      canManageSchool: me?.permissions.some((code) =>
        ["manage_master_data", "manage_enrollments", "view_users"].includes(code),
      ),
      can,
    });
    const hrefs = new Set(workspaces.map((item) => item.href));
    const items = [
      ...workspaces,
      ...authorizedItems.filter((item) => !hrefs.has(item.href)),
    ].filter((item) =>
      canOpenPath(
        item.href,
        (permission) => me?.permissions.includes(permission) ?? false,
        me?.profile_kind,
      ),
    );
    return groupNavigation(items).map((group) => ({
      heading: tNav(group.labelKey),
      items: group.items.map((item) => ({
        id: item.key,
        label: tNav(item.labelKey),
        keywords: item.searchTerms?.map((key) => tNav(key)),
        icon: <item.icon aria-hidden="true" />,
        onSelect: () => {
          if (!confirmUnsavedChangesBeforeNavigation()) return;
          setIsOpen(false);
          router.push(item.href);
        },
      })),
    }));
  }, [me?.permissions, me?.profile_kind, me?.roles, me?.duties, router, tNav]);

  const quickActionGroup: CommandPaletteGroup | null = useMemo(() => {
    if (quickActions.length === 0) return null;
    return {
      heading: tQuick("group"),
      items: quickActions.map((action) => ({
        id: `quick-${action.id}`,
        label: tQuick(`actions.${action.labelKey}`),
        icon: <action.icon aria-hidden="true" />,
        onSelect: () => {
          if (!confirmUnsavedChangesBeforeNavigation()) return;
          setIsOpen(false);
          router.push(quickActionHref(action));
        },
      })),
    };
  }, [quickActions, router, tQuick]);

  // Same right as the student-profile registry entry: no student request is
  // made for a reader who could not open the page it leads to.
  const canOpenStudentProfile = useMemo(
    () =>
      canOpenPath(
        studentProfileHref("search"),
        (permission) => me?.permissions.includes(permission) ?? false,
        me?.profile_kind,
        (me?.roles ?? []).map((role) => role.slug),
      ),
    [me?.permissions, me?.profile_kind, me?.roles],
  );
  const studentIcon = useMemo(() => <domainIcons.users aria-hidden="true" />, []);
  const openStudent = useCallback(
    (studentId: string) => {
      if (!confirmUnsavedChangesBeforeNavigation()) return;
      setIsOpen(false);
      router.push(studentProfileHref(studentId));
    },
    [router],
  );
  const students = usePaletteStudentGroup({
    enabled: hasOpened && isOpen && canOpenStudentProfile,
    heading: tQuick("students"),
    icon: studentIcon,
    onSelect: openStudent,
  });
  const resetStudentSearch = students.reset;
  useEffect(() => {
    if (!isOpen) resetStudentSearch();
  }, [isOpen, resetStudentSearch]);

  const groups = useMemo(
    () => [
      ...(students.group ? [students.group] : []),
      ...(quickActionGroup ? [quickActionGroup] : []),
      ...pageGroups,
    ],
    [students.group, quickActionGroup, pageGroups],
  );

  const open = useCallback(() => {
    setHasOpened(true);
    setIsOpen(true);
  }, []);
  // Same rationale as SessionProvider/TenantProvider: keep the value's
  // identity stable so consumers of `useCommandPalette()` don't re-render on
  // every render of this provider (docs/16-audit-performa-web.md item 3).
  const value = useMemo<CommandPaletteContextValue>(() => ({ open }), [open]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {hasOpened && (
        <CommandPalette
          open={isOpen}
          onOpenChange={setIsOpen}
          groups={groups}
          onSearchChange={students.onSearchChange}
          placeholder={t("placeholder")}
          label={t("trigger")}
          emptyLabel={t("empty")}
        />
      )}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return context;
}
