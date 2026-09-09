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
        "flex flex-col items-center gap-3 rounded-sm border border-dashed border-border p-10 text-center",
        className,
      )}
    >
      {icon && (
        <span className="text-fg-muted [&>svg]:size-6" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-medium text-fg">{title}</p>
        {description && <p className="text-[13px] text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
