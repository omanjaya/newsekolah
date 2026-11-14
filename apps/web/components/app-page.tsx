"use client";

import {
  cn,
  NavTabs,
  PageHeader,
  PageShell,
  type BreadcrumbItem,
  type NavTabsLinkProps,
  type PageHeaderAction,
  type PageShellVariant,
} from "@newsekolah/ui";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { resolvePageContext, withCarriedParams } from "../lib/navigation/page-context";
import { useAppNavigation } from "../lib/navigation/use-app-navigation";
import { useDocumentTitle } from "../lib/page-title";

export interface AppPageProps {
  /** `default` (1200, lists and details), `wide` (1440, dashboards), `narrow` (720, forms and settings), `fit` (viewport height, tables and grids). */
  variant?: PageShellVariant;
  /** The page's h1. Defaults to the label of the menu entry the route belongs to. */
  title?: ReactNode;
  /**
   * The page's name in the browser tab, before the school's ("Jurnal
   * mengajar · SMA Contoh"). Defaults to a string `title`, else the
   * current tab's label, else the menu entry's.
   */
  documentTitle?: string;
  /** Muted line above the title. Defaults to the sidebar group ("Data Sekolah") on an area's own pages; `false` hides it. */
  eyebrow?: ReactNode | false;
  description?: ReactNode;
  /** The trail above the title. Defaults to "page > this" on a detail route; `false` hides it. */
  breadcrumb?: BreadcrumbItem[] | false;
  /** Free-form controls beside the title (a select, a date switcher). */
  actions?: ReactNode;
  /** The one main action, always visible. */
  primaryAction?: ReactNode;
  /** Further actions: buttons from 640px up, one menu on a phone. */
  secondaryActions?: PageHeaderAction[];
  /**
   * Transitional: `false` when the content still renders its own heading.
   * The template keeps the frame, the tab title and the sub-navigation.
   */
  header?: false;
  /**
   * The area's sub-navigation, under the header. Defaults to the area's
   * pages from the navigation registry as tabs; pass an area's own
   * navigation component instead, or `false` for none.
   */
  nav?: ReactNode | false;
  /** Query parameters the default tabs carry from page to page (e.g. `["date"]`). */
  navParams?: readonly string[];
  /** Filters, a search or a date switcher that act on the content, under the head. */
  toolbar?: ReactNode;
  /** Fixed-position elements (a StickySaveBar), kept out of the entering content. */
  floating?: ReactNode;
  className?: string;
  /** Classes for the content area, e.g. a grid that replaces the default column. */
  contentClassName?: string;
  children?: ReactNode;
}

function renderNavLink({ href, className, children, ...rest }: NavTabsLinkProps): ReactNode {
  return (
    <Link href={href} className={className} aria-current={rest["aria-current"]}>
      {children}
    </Link>
  );
}

/**
 * The frame of every screen in the `(app)` route group: `PageShell` with a
 * `PageHeader` and the area's tabs, filled from the navigation registry
 * (lib/navigation/page-context.ts) so a page only says what is its own.
 * It also names the browser tab after the page.
 *
 * ```tsx
 * <AppPage variant="fit" primaryAction={<Button>Tambah</Button>}>
 *   <DataTable fillHeight ... />
 * </AppPage>
 * ```
 */
export function AppPage({
  variant = "default",
  title,
  documentTitle,
  eyebrow,
  description,
  breadcrumb,
  actions,
  primaryAction,
  secondaryActions,
  header,
  nav,
  navParams = [],
  toolbar,
  floating,
  className,
  contentClassName,
  children,
}: AppPageProps): ReactElement {
  const pathname = usePathname();
  const search = useSearchParams();
  const entries = useAppNavigation();
  const t = useTranslations();
  const tPage = useTranslations("app.page");
  const context = resolvePageContext(pathname, entries);

  const label = (key: string | undefined): string | undefined =>
    key !== undefined && t.has(key) ? t(key) : undefined;
  const entryLabel = label(context.entry?.labelKey);
  const pageLabel = label(context.page?.labelKey);
  const currentTab = context.tabs.find((tab) => tab.current);

  const resolvedTitle = title ?? (context.isDetail ? pageLabel : (entryLabel ?? pageLabel));
  const derivedBreadcrumb: BreadcrumbItem[] | undefined =
    context.isDetail && context.page && pageLabel
      ? [
          { label: pageLabel, href: context.page.href },
          ...(typeof title === "string" ? [{ label: title }] : []),
        ]
      : undefined;
  const resolvedBreadcrumb = breadcrumb === false ? undefined : (breadcrumb ?? derivedBreadcrumb);
  // On a detail page the trail already says where the page sits.
  const resolvedEyebrow =
    eyebrow === false
      ? undefined
      : (eyebrow ?? (resolvedBreadcrumb ? undefined : label(context.groupKey)));

  useDocumentTitle(
    documentTitle ??
      (typeof title === "string" ? title : undefined) ??
      label(currentTab?.labelKey) ??
      (typeof resolvedTitle === "string" ? resolvedTitle : undefined),
  );

  const areaName = entryLabel ?? (typeof resolvedTitle === "string" ? resolvedTitle : "");
  const resolvedNav =
    nav === false
      ? null
      : (nav ??
        (context.tabs.length >= 2 ? (
          <NavTabs
            aria-label={tPage("sections", { area: areaName })}
            variant="underline"
            items={context.tabs.map((tab) => ({
              href: withCarriedParams(tab.href, search, navParams),
              label: label(tab.labelKey) ?? tab.key,
              current: tab.current,
            }))}
            renderLink={renderNavLink}
          />
        ) : null));

  return (
    <PageShell
      variant={variant}
      // The template sits under the app's sticky header, which a `fit`
      // page subtracts from the viewport. The shell publishes its measured
      // height, strips included, as --shell-header-height; until the first
      // measure the bare header's 56px stands in.
      className={cn("[--page-offset-top:var(--shell-header-height,3.5rem)]", className)}
      breadcrumb={resolvedBreadcrumb}
      header={
        header === false || resolvedTitle === undefined ? undefined : (
          <PageHeader
            className="pb-0"
            eyebrow={resolvedEyebrow}
            title={resolvedTitle}
            description={description}
            actions={actions}
            primaryAction={primaryAction}
            secondaryActions={secondaryActions}
            // The phone's header names the page once this title scrolls
            // away; a page that set its own tab name (the home's greeting
            // is "Beranda" there) is named the same way in both.
            compactTitle={documentTitle}
          />
        )
      }
      nav={resolvedNav}
      toolbar={toolbar}
      floating={floating}
      contentClassName={contentClassName}
    >
      {children}
    </PageShell>
  );
}
