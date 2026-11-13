"use client";

import { Ellipsis } from "lucide-react";
import { isValidElement, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb.js";
import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { IconButton } from "./icon-button.js";
import { useUiLabels } from "./ui-labels.js";
import { UiLink } from "./ui-link.js";

export type PageHeaderBreadcrumbItem = BreadcrumbItem;

/** A secondary page action: a button beside the primary one from 640px up, an item of the overflow menu below. */
export interface PageHeaderAction {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  /** Danger-coloured, for a destructive action. */
  destructive?: boolean;
}

export interface PageHeaderProps {
  /** The section the page belongs to, above the title ("Data Sekolah"). */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One sentence under the title, at most a line and a half wide. */
  description?: ReactNode;
  /** The trail to this page: items, or a ready Breadcrumb. */
  breadcrumb?: PageHeaderBreadcrumbItem[] | ReactNode;
  /** Free-form controls beside the title (filters, a select); they wrap under it on a phone. */
  actions?: ReactNode;
  /** The page's one main action, always visible, rightmost. */
  primaryAction?: ReactNode;
  /** Further actions: buttons from 640px up, one overflow menu on a phone. */
  secondaryActions?: PageHeaderAction[];
  /** A rule under the header; off by default, as in the artboard (sections are set apart by space). */
  divider?: boolean;
  className?: string;
}

function SecondaryButtons({ actions }: { actions: PageHeaderAction[] }) {
  return (
    <div className="hidden sm:contents">
      {actions.map((action) =>
        action.href && !action.disabled ? (
          <Button key={action.label} asChild variant="secondary" icon={action.icon}>
            <UiLink href={action.href}>{action.label}</UiLink>
          </Button>
        ) : (
          <Button
            key={action.label}
            variant="secondary"
            icon={action.icon}
            disabled={action.disabled}
            onClick={action.onSelect}
          >
            {action.label}
          </Button>
        ),
      )}
    </div>
  );
}

function OverflowMenu({ actions, className }: { actions: PageHeaderAction[]; className: string }) {
  const labels = useUiLabels();
  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            variant="outline"
            icon={<Ellipsis />}
            aria-label={labels.pageHeaderMoreActions}
            className="rounded-full bg-surface"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              disabled={action.disabled}
              onSelect={action.onSelect}
              asChild={Boolean(action.href) && !action.disabled}
              className={cn("min-h-11 [&>svg]:size-4", action.destructive && "text-danger")}
            >
              {action.href && !action.disabled ? (
                <UiLink href={action.href}>
                  {action.icon}
                  {action.label}
                </UiLink>
              ) : (
                <>
                  {action.icon}
                  {action.label}
                </>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The top of every page (docs/07-ui-ux.md, "Hijau Segar"): breadcrumb,
 * muted eyebrow, the title on the display role, an optional description,
 * and the page's actions centred on the title line. On a phone the
 * actions move under the title and secondary ones collapse into a menu.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumb,
  actions,
  primaryAction,
  secondaryActions = [],
  divider = false,
  className,
}: PageHeaderProps) {
  const crumbs = Array.isArray(breadcrumb) ? (
    <Breadcrumb items={breadcrumb} />
  ) : isValidElement(breadcrumb) ? (
    breadcrumb
  ) : null;
  const hasActions = Boolean(actions) || Boolean(primaryAction) || secondaryActions.length > 0;
  // A destructive action never sits out as a button: it waits in the menu
  // at every width, where it takes a deliberate second tap.
  const buttons = secondaryActions.filter((action) => !action.destructive);
  const destructive = secondaryActions.filter((action) => action.destructive);

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        divider ? "border-b border-line pb-4" : "pb-2",
        className,
      )}
    >
      {crumbs}
      <div className="flex flex-col gap-1">
        {eyebrow && <p className="text-body-sm text-fg-muted">{eyebrow}</p>}
        {/* One column on a phone (title, description, then actions); from
            640px the actions share the title's row and the description
            runs under both. */}
        <div className="grid grid-cols-1 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-6">
          <h1 className="min-w-0 text-display text-fg">{title}</h1>
          {hasActions && (
            <div className="order-last flex flex-wrap items-center gap-2 max-sm:mt-1 sm:order-none sm:justify-end">
              {actions}
              {buttons.length > 0 && <SecondaryButtons actions={buttons} />}
              {primaryAction}
              {secondaryActions.length > 0 && (
                <OverflowMenu actions={secondaryActions} className="sm:hidden" />
              )}
              {destructive.length > 0 && (
                <OverflowMenu actions={destructive} className="hidden sm:block" />
              )}
            </div>
          )}
          {description && (
            <div className="max-w-prose text-body text-fg-muted sm:col-span-2">{description}</div>
          )}
        </div>
      </div>
    </div>
  );
}
