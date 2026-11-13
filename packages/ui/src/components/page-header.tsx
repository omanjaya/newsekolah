"use client";

import { Ellipsis } from "lucide-react";
import { isValidElement, type ComponentPropsWithRef, type ReactNode } from "react";

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

export interface PageHeaderProps extends Omit<ComponentPropsWithRef<"div">, "title" | "children"> {
  /** The section the page belongs to, above the title ("Data Sekolah"). */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One sentence under the title, at most a line and a half wide. */
  description?: ReactNode;
  /** The trail to this page: items, or a ready Breadcrumb. */
  breadcrumb?: PageHeaderBreadcrumbItem[] | ReactNode;
  /** Free-form controls beside the title (filters, a select); they wrap under it on a phone or when they do not fit. */
  actions?: ReactNode;
  /** The page's one main action, always visible, rightmost. */
  primaryAction?: ReactNode;
  /** Further actions: buttons from 640px up, one overflow menu on a phone. */
  secondaryActions?: PageHeaderAction[];
  /** A rule under the header; off by default, as in the artboard (sections are set apart by space). */
  divider?: boolean;
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
            variant="surface"
            icon={<Ellipsis />}
            aria-label={labels.pageHeaderMoreActions}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((action) => {
            // A disabled link is a plain item: there is nothing to follow.
            const href = action.disabled ? undefined : action.href;
            return (
              <DropdownMenuItem
                key={action.label}
                icon={action.icon}
                tone={action.destructive ? "danger" : "default"}
                disabled={action.disabled}
                onSelect={action.onSelect}
                asChild={href !== undefined}
              >
                {href !== undefined ? <UiLink href={href}>{action.label}</UiLink> : action.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The top of every page (docs/07-ui-ux.md, "Hijau Segar"): breadcrumb,
 * muted eyebrow, the title on the display role, an optional description,
 * and the page's actions centred on the title line. When the actions do
 * not fit beside the title they wrap under it, as they do on a phone,
 * where secondary ones also collapse into a menu.
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
  ...props
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
      {...props}
    >
      {crumbs}
      <div className="flex flex-col gap-1">
        {eyebrow && <p className="text-body-sm text-fg-muted">{eyebrow}</p>}
        {/* One column on a phone: title, description, then actions. From
            640px a wrapping row: the title claims at least 16rem and takes
            all the spare width, which pushes the actions to the right end;
            when the actions do not fit beside that, they wrap onto their
            own line under the title, start-aligned as on a phone, instead
            of squeezing it. The description always gets a line of its own. */}
        <div className="flex flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <h1 className="min-w-0 text-display text-fg sm:grow-999 sm:basis-64">{title}</h1>
          {hasActions && (
            <div
              data-slot="page-header-actions"
              className="order-last flex min-w-0 flex-wrap items-center gap-2 max-sm:mt-1 sm:order-none sm:grow"
            >
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
            <div className="text-body text-fg-muted sm:basis-full">
              <div className="max-w-prose">{description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
