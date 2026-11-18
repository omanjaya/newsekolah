"use client";

import { Ellipsis } from "lucide-react";
import { isValidElement, useRef, type ComponentPropsWithRef, type ReactNode } from "react";

import { useCollapsingTitle } from "../hooks/use-collapsing-title.js";
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

/** The main action as an icon button on a phone: the label is its accessible name and tooltip. */
export interface PageHeaderCompactAction {
  icon: ReactNode;
  label: string;
  onSelect?: () => void;
  href?: string;
  /** Mirrors a disabled `primaryAction`, so the phone's form is not tappable either. */
  disabled?: boolean;
}

export interface PageHeaderProps extends Omit<ComponentPropsWithRef<"div">, "title" | "children"> {
  /** The section the page belongs to, above the title ("Data Sekolah"). */
  eyebrow?: ReactNode;
  title: ReactNode;
  /**
   * An avatar or an icon circle before the title, for a page about one
   * person or thing (a student's record, a book). It is centred on the
   * title and its description together.
   */
  leading?: ReactNode;
  /** One sentence under the title, at most a line and a half wide. */
  description?: ReactNode;
  /** The trail to this page: items, or a ready Breadcrumb. */
  breadcrumb?: PageHeaderBreadcrumbItem[] | ReactNode;
  /** Free-form controls beside the title (filters, a select); they wrap under it on a phone or when they do not fit. */
  actions?: ReactNode;
  /** The page's one main action, always visible, rightmost. */
  primaryAction?: ReactNode;
  /**
   * The phone's form of `primaryAction`: below 640px the main action is an
   * icon button at the end of the title's line (beside the overflow menu)
   * instead of a full-width row under the title; from 640px up
   * `primaryAction` shows as usual. Opt-in, for list pages whose action is
   * clear from its icon ("Tambah" with a plus).
   */
  primaryActionCompact?: PageHeaderCompactAction;
  /** Further actions: buttons from 640px up, one overflow menu on a phone. */
  secondaryActions?: PageHeaderAction[];
  /** A rule under the header; off by default, as in the artboard (sections are set apart by space). */
  divider?: boolean;
  /**
   * The page's name in an app's compact header once the title has
   * scrolled away under it (`useCollapsedTitle`). Defaults to the title's
   * text; `false` keeps the compact header as it is.
   */
  compactTitle?: string | false;
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

/** The phone's main action at the end of the title's line: an accent icon button, 44px on touch. */
function CompactPrimary({ action }: { action: PageHeaderCompactAction }) {
  return action.href && !action.disabled ? (
    <IconButton asChild variant="primary" icon={action.icon} aria-label={action.label}>
      <UiLink href={action.href} onClick={action.onSelect} />
    </IconButton>
  ) : (
    <IconButton
      variant="primary"
      icon={action.icon}
      aria-label={action.label}
      disabled={action.disabled}
      onClick={action.onSelect}
    />
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

/*
 * The title block is a grid, so the leading avatar, the title, the phone's
 * trailing buttons (the overflow menu, a compact primary action) and the
 * description each keep their place without a
 * wrapper between the title and its description. Spelled out per case:
 * Tailwind only sees whole class names.
 */
function headingColumns(leading: boolean, phoneTrailing: boolean): string {
  if (leading && phoneTrailing) {
    return "grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)]";
  }
  if (leading) return "grid-cols-[auto_minmax(0,1fr)]";
  if (phoneTrailing) return "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)]";
  return "grid-cols-[minmax(0,1fr)]";
}

/**
 * The top of every page (docs/07-ui-ux.md, "Hijau Segar"): breadcrumb,
 * muted eyebrow, an optional leading avatar or icon, the title on the
 * display role, an optional description, and the page's actions centred on
 * the title line. When the actions do not fit beside the title they wrap
 * under it, as they do on a phone, where secondary ones collapse into a
 * menu whose button sits at the end of the title's own line. While the
 * title is scrolled out of view it is offered to the app's compact header
 * (`compactTitle`).
 */
export function PageHeader({
  eyebrow,
  title,
  leading,
  description,
  breadcrumb,
  actions,
  primaryAction,
  primaryActionCompact,
  secondaryActions = [],
  divider = false,
  compactTitle,
  className,
  ...props
}: PageHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useCollapsingTitle(titleRef, compactTitle);
  const crumbs = Array.isArray(breadcrumb) ? (
    <Breadcrumb items={breadcrumb} />
  ) : isValidElement(breadcrumb) ? (
    breadcrumb
  ) : null;
  const hasActions = Boolean(actions) || Boolean(primaryAction) || secondaryActions.length > 0;
  const compactPrimary = primaryActionCompact !== undefined;
  // On a phone only the free-form actions and the primary one keep a row
  // under the title; the overflow menu, and the primary in its compact
  // form, sit on the title's line.
  const phoneActions = Boolean(actions) || (Boolean(primaryAction) && !compactPrimary);
  const phoneTrailing = secondaryActions.length > 0 || compactPrimary;
  const hasLeading = leading !== undefined && leading !== null && leading !== false;
  // Only a title alone beside its leading item centres on it; with a
  // description the two lines share the avatar's height already.
  const centredOnLeading = hasLeading && !description;
  // A destructive action never sits out as a button: it waits in the menu
  // at every width, where it takes a deliberate second tap.
  const buttons = secondaryActions.filter((action) => !action.destructive);
  const destructive = secondaryActions.filter((action) => action.destructive);

  return (
    <div
      // A stable hook for layout rules around the header (the app's
      // WorkspaceNav orders itself after it), so they never depend on the
      // header's inner DOM.
      data-slot="page-header"
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
        {/* The title and its description are one block, so nothing ever
            comes between them. On a phone the actions follow that block.
            From 640px the two are a wrapping row: the block claims at
            least 16rem (28rem with a description, room for the sentence
            to read as a line and a half) and takes all the spare width,
            which pushes the actions to the right end, centred on the
            title's first line; when they do not fit beside it, they wrap
            under the whole block, start-aligned as on a phone, instead of
            squeezing the title or splitting it from its description. */}
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-4",
            // Beside a title centred on its avatar, the actions centre too.
            centredOnLeading && "sm:items-center",
          )}
        >
          <div
            data-slot="page-header-heading"
            className={cn(
              "grid min-w-0 items-start gap-x-3 gap-y-2 sm:grow-999",
              headingColumns(hasLeading, phoneTrailing),
              hasLeading && "gap-x-4",
              description ? "sm:basis-112" : "sm:basis-64",
            )}
          >
            {hasLeading && (
              <div
                data-slot="page-header-leading"
                className={cn("flex shrink-0 self-center", description && "row-span-2")}
              >
                {leading}
              </div>
            )}
            {/* A title with no description beside a taller leading avatar
                centres on it, instead of hanging from its top edge. */}
            <h1
              ref={titleRef}
              className={cn("min-w-0 text-display text-fg", centredOnLeading && "self-center")}
            >
              {title}
            </h1>
            {/* The phone's overflow button ends the title's first line
                (a 36px button, 44px on touch, centred on the 28px line)
                instead of taking a row of its own under the description.
                A compact primary action stands just before it. */}
            {phoneTrailing &&
              (compactPrimary ? (
                <div
                  data-slot="page-header-phone-actions"
                  className={cn(
                    "-my-1 flex items-center gap-2 self-start pointer-coarse:-my-2 sm:hidden",
                    centredOnLeading && "self-center",
                  )}
                >
                  <CompactPrimary action={primaryActionCompact} />
                  {secondaryActions.length > 0 && (
                    <OverflowMenu actions={secondaryActions} className="flex" />
                  )}
                </div>
              ) : (
                <OverflowMenu
                  actions={secondaryActions}
                  className={cn(
                    "-my-1 self-start pointer-coarse:-my-2 sm:hidden",
                    centredOnLeading && "self-center",
                  )}
                />
              ))}
            {description && (
              <div
                className={cn(
                  "max-w-prose text-body text-pretty text-fg-muted",
                  hasLeading ? "col-[2/-1]" : "col-span-full",
                )}
              >
                {description}
              </div>
            )}
          </div>
          {/* A 40px row centred on the 32px title line: 4px above it and
              4px below, so a 32, 36 or 40px control all share the title's
              centre and the row's margin box is exactly the title line. A
              header with an action is then no taller than one without, and
              the tabs under it do not jump between sibling pages. */}
          {hasActions && (
            <div
              data-slot="page-header-actions"
              className={cn(
                "min-w-0 flex-wrap items-center gap-2 sm:-my-1 sm:flex sm:min-h-10 sm:grow",
                phoneActions ? "flex" : "hidden",
              )}
            >
              {actions}
              {buttons.length > 0 && <SecondaryButtons actions={buttons} />}
              {compactPrimary && primaryAction ? (
                <div className="hidden sm:contents">{primaryAction}</div>
              ) : (
                primaryAction
              )}
              {destructive.length > 0 && (
                <OverflowMenu actions={destructive} className="hidden sm:block" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
