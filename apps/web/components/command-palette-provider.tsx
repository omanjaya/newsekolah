"use client";

import { CommandPalette, type CommandPaletteGroup } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { navigation } from "../lib/navigation";
import { useSession } from "../lib/session/session-provider";

interface CommandPaletteContextValue {
  open: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/**
 * Global Ctrl/Cmd+K search (docs/07-ui-ux.md section 2). Wired to the same
 * `navigation` registry as the sidebar and tab bar, filtered by the same
 * permissions, so it can never offer a page the user cannot open.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { me } = useSession();
  const t = useTranslations("app.shell.commandPalette");
  const tNav = useTranslations();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const groups: CommandPaletteGroup[] = useMemo(() => {
    const items = navigation
      .filter((item) => !item.permission || (me?.permissions.includes(item.permission) ?? false))
      .map((item) => ({
        id: item.key,
        label: tNav(item.labelKey),
        icon: <item.icon aria-hidden="true" />,
        onSelect: () => {
          setIsOpen(false);
          router.push(item.href);
        },
      }));
    return [{ heading: t("trigger"), items }];
  }, [me?.permissions, router, t, tNav]);

  return (
    <CommandPaletteContext.Provider
      value={{
        open: () => {
          setIsOpen(true);
        },
      }}
    >
      {children}
      <CommandPalette
        open={isOpen}
        onOpenChange={setIsOpen}
        groups={groups}
        placeholder={t("placeholder")}
      />
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
