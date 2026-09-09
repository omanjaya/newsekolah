import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../utils/cn.js";

export interface CommandPaletteItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export interface CommandPaletteGroup {
  heading: string;
  items: CommandPaletteItem[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandPaletteGroup[];
  placeholder?: string;
  emptyLabel?: string;
  label?: string;
}

/**
 * Global search (Ctrl/Cmd+K), per docs/07-ui-ux.md section 2. Results are
 * whatever `groups` the caller already filtered by permission; this
 * component only renders and searches them.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder = "Cari halaman, siswa, guru, atau aksi",
  emptyLabel = "Tidak ada hasil yang cocok",
  label = "Pencarian global",
}: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-(--z-overlay) bg-black/40",
            "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-24 z-(--z-modal) w-full max-w-lg -translate-x-1/2",
            "rounded-sm border border-border bg-surface shadow-(--shadow-float)",
            "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <CommandPrimitive label={label} className="flex flex-col overflow-hidden rounded-sm">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-fg-muted" aria-hidden="true" />
              <CommandPrimitive.Input
                placeholder={placeholder}
                className={cn(
                  "h-11 w-full bg-transparent text-[14px] text-fg outline-none",
                  "placeholder:text-fg-muted",
                )}
              />
            </div>
            <CommandPrimitive.List className="max-h-80 overflow-y-auto p-1">
              <CommandPrimitive.Empty className="py-6 text-center text-[13px] text-fg-muted">
                {emptyLabel}
              </CommandPrimitive.Empty>
              {groups.map((group) => (
                <CommandPrimitive.Group
                  key={group.heading}
                  heading={group.heading}
                  className={cn(
                    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
                    "[&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium",
                    "[&_[cmdk-group-heading]]:text-fg-muted",
                  )}
                >
                  {group.items.map((item) => (
                    <CommandPrimitive.Item
                      key={item.id}
                      onSelect={item.onSelect}
                      className={cn(
                        "flex h-9 cursor-pointer items-center gap-2 rounded-xs px-2 text-[13px] text-fg",
                        "data-[selected=true]:bg-bg",
                      )}
                    >
                      {item.icon && (
                        <span className="text-fg-muted [&>svg]:size-4" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      <span className="flex-1">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[12px] text-fg-muted">{item.shortcut}</span>
                      )}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
