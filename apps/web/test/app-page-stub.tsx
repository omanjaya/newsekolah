import type { ReactElement } from "react";

import type { AppPageProps } from "../components/app-page";

/**
 * A stand-in for `components/app-page` in view tests, which render a view
 * without the session, tenant and router the real template reads. It keeps
 * what a view passes visible to queries: the title as the h1, the header
 * actions, the sub-navigation, the toolbar and the content.
 *
 * vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
 */
export function AppPage({
  title,
  eyebrow,
  description,
  actions,
  primaryAction,
  secondaryActions = [],
  header,
  nav,
  toolbar,
  floating,
  children,
}: AppPageProps): ReactElement {
  return (
    <div data-testid="app-page">
      {header !== false && (
        <div>
          {eyebrow !== false && eyebrow !== undefined && <p>{eyebrow}</p>}
          {title !== undefined && <h1>{title}</h1>}
          {description}
          {actions}
          {secondaryActions.map((action) =>
            action.href ? (
              <a key={action.label} href={action.href}>
                {action.label}
              </a>
            ) : (
              <button key={action.label} type="button" onClick={action.onSelect}>
                {action.label}
              </button>
            ),
          )}
          {primaryAction}
        </div>
      )}
      {nav !== false && nav}
      {toolbar}
      {children}
      {floating}
    </div>
  );
}
