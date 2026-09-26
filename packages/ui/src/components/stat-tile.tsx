import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../utils/cn.js";

export type StatTileTone = "green" | "amber" | "purple" | "blue" | "red";
export interface StatTileProps {
  icon: LucideIcon;
  tone: StatTileTone;
  value: ReactNode;
  label: string;
  hint?: string;
  className?: string;
}

// Full class names so Tailwind's scanner generates them.
const TONE: Record<StatTileTone, string> = {
  green: "bg-category-green-soft text-category-green-soft-fg",
  amber: "bg-category-amber-soft text-category-amber-soft-fg",
  purple: "bg-category-purple-soft text-category-purple-soft-fg",
  blue: "bg-category-blue-soft text-category-blue-soft-fg",
  red: "bg-category-red-soft text-category-red-soft-fg",
};

/** One number on a home screen: topic icon in a soft circle, Manrope value, label. */
export function StatTile({
  icon: Icon,
  tone,
  value,
  label,
  hint,
  className,
}: StatTileProps): ReactElement {
  return (
    <div
      className={cn(
        "flex min-h-[104px] flex-col gap-3 rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <span className={cn("flex size-9 items-center justify-center rounded-full", TONE[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col">
        <span className="font-heading text-[22px] leading-tight font-bold tabular-nums text-fg">
          {value}
        </span>
        <span className="text-[13px] text-fg">{label}</span>
        {hint && <span className="text-[12px] text-fg-muted">{hint}</span>}
      </div>
    </div>
  );
}
