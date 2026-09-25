import type { ReactNode } from "react";

import { cn } from "../utils/cn.js";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Every empty list needs one way forward, per docs/05-shared-components.md ("Setiap daftar wajib memberi aksi"). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-dashed border-border p-10 text-center",
        className,
      )}
    >
      {icon && (
        <span
          className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg [&>svg]:size-6"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-heading text-[16px] font-bold tracking-tight text-fg">{title}</p>
        {description && <p className="text-[13px] text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
