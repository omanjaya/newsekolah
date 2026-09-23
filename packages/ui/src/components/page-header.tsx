import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../utils/cn.js";

export interface PageHeaderBreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  breadcrumb?: PageHeaderBreadcrumbItem[];
  className?: string;
}

/** Page title 24 medium, per DESIGN.md typography. */
export function PageHeader({ eyebrow, title, actions, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 border-b border-border pb-4", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav
          aria-label="Navigasi halaman"
          className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] text-fg-muted"
        >
          {breadcrumb.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
              {item.href ? (
                <a href={item.href} className="hover:text-fg hover:underline">
                  {item.label}
                </a>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          {eyebrow && <p className="text-[13px] font-medium text-fg-muted">{eyebrow}</p>}
          <h1 className="text-[24px] font-medium text-fg">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
