/**
 * Which message namespaces each `NextIntlClientProvider` in the tree
 * carries (docs/16-audit-performa-web.md item 11: the full ~158 kB raw
 * catalog was serialized into every page's HTML). Each nested provider
 * below the root replaces `messages` outright (`use-intl`'s `IntlProvider`
 * only falls back to the parent context when `messages` is `undefined`,
 * never merges), so every set here is self-contained: it lists everything
 * a component rendered in that subtree reads via `useTranslations()`, not
 * just the namespaces newly added at that level.
 *
 * Built by grepping `useTranslations("...")` (and the occasional bare
 * `useTranslations()`, which resolves dotted keys against the whole tree)
 * across `apps/web`. When a screen goes blank on a translation key, the
 * fix is almost always adding its namespace to the right set here, not
 * touching `get-messages.ts`. When in doubt, add the namespace to a
 * broader set rather than risk a missing string.
 */

import { libraryNavItems } from "../navigation-library";

/** The shared `@newsekolah/i18n` catalog, always carried whole: small (see
 * `packages/i18n/messages/*.json`) and read from `(auth)`, `(public)`, and
 * `(app)` alike (`common`/`errors` via `components/query-error.tsx`, `auth`
 * via the login/change-password forms, `nav` via the sidebar's bare
 * `useTranslations()`). */
const SHARED_NAMESPACES = ["common", "errors", "auth", "nav", "validation"] as const;

/**
 * `app.*` namespaces needed outside `(app)` — i.e. by `(auth)` (login,
 * forgot/reset password, forced change-password) and `(public)`
 * (`/offline`), plus root-level boundaries (`app/error.tsx`,
 * `app/not-found.tsx`) and `app/providers.tsx`'s `UiLocaleProvider`, which
 * mounts above the `(app)` route group and reads `app.shell.table`. These
 * have to live in the root provider: there is no nested provider around
 * `(auth)`/`(public)`.
 */
const ROOT_APP_NAMESPACES = [
  "app.shell",
  "app.common",
  "app.error",
  "app.notFound",
  "app.offlinePage",
  "app.login",
  "app.changePassword",
  "app.verify",
  "app.account",
  "app.security",
] as const;

/**
 * The root layout's provider (`app/layout.tsx`): the shared catalog plus
 * the `app.*` namespaces above, plus one nested slice of the `library`
 * feature catalog. `(public)/opac` (`features/library/components/opac-view.tsx`)
 * needs `app.library.opac`, but it renders outside `(app)` entirely, so it
 * can't reach the `library` namespace carried by `(app)/library/layout.tsx`
 * (item 11's per-segment split). Picking just the `opac` subtree avoids
 * shipping the other ~32 kB of `library` (catalogue, desk, reports, ...) to
 * every page just for one public route.
 */
export const ROOT_NAMESPACES: readonly string[] = [
  ...SHARED_NAMESPACES,
  ...ROOT_APP_NAMESPACES,
  "app.library.opac",
];

/**
 * Every registered feature catalog (`messages/features/index.ts`) except
 * `library`, which gets its own provider in `(app)/library/layout.tsx`
 * (item 11: 35 kB raw on its own, the single biggest catalog). `account`
 * and `security` are already in `ROOT_APP_NAMESPACES`.
 */
const APP_FEATURE_NAMESPACES = [
  "app.academic",
  "app.activities",
  "app.analytics",
  "app.attendanceEditor",
  "app.attendanceReports",
  "app.audit",
  "app.billing",
  "app.calendar",
  "app.dashboardPersona",
  "app.discipline",
  "app.documents",
  "app.family",
  "app.grading",
  "app.integrations",
  "app.journal",
  "app.mentoring",
  "app.messaging",
  "app.monitor",
  "app.onboarding",
  "app.platform",
  "app.promotion",
  "app.reportExport",
  "app.reports",
  "app.sso",
  "app.staffAttendance",
  "app.supervision",
  "app.visitors",
  "app.workflows",
] as const;

/**
 * The base `apps/web/messages/*.json` `app.*` keys used only inside
 * `(app)` (navigation, per-role dashboards, admin screens, ...), i.e.
 * everything in that file not already covered by `ROOT_APP_NAMESPACES`.
 */
const APP_BASE_NAMESPACES = [
  "app.announcements",
  "app.attendance",
  "app.dashboard",
  "app.duty",
  "app.forbidden",
  "app.homeroom",
  "app.navigation",
  "app.notifications",
  "app.permits",
  "app.profile",
  "app.roles",
  "app.schedule",
  "app.school",
  "app.settings",
  "app.substitutions",
] as const;

/**
 * The sidebar, command palette, and mobile tab bar render under `(app)`'s
 * provider on every page and label the library nav entries from the
 * library catalog, so those exact leaf keys ride along with `(app)` even
 * though the catalog itself stays scoped to `/library/*`. Derived from the
 * registry so a new library screen can't silently lose its nav label.
 */
const LIBRARY_NAV_LABEL_KEYS = libraryNavItems
  .map((item) => item.labelKey)
  .filter((labelKey) => labelKey.startsWith("app.library."));

/**
 * `(app)/layout.tsx`'s provider: everything the root carries (so shared
 * components like `QueryError` still resolve inside `(app)`, since nesting
 * replaces rather than merges — see the file doc comment) plus every
 * feature and base namespace `(app)` screens use, minus `library` (its nav
 * labels excepted, see above).
 */
export const APP_NAMESPACES: readonly string[] = [
  ...ROOT_NAMESPACES,
  ...APP_FEATURE_NAMESPACES,
  ...APP_BASE_NAMESPACES,
  ...LIBRARY_NAV_LABEL_KEYS,
];

/**
 * `(app)/library/layout.tsx`'s provider: the shared catalog and the
 * root-level `app.*` namespaces (library screens still render inside
 * `(app)`'s shell — nothing there needs re-provisioning — but they do use
 * `QueryError`/`common`/`errors`), plus the *full* `library` catalog in
 * place of the `app.library.opac` sliver the root carries for `/opac`.
 * Deliberately does not include `APP_FEATURE_NAMESPACES`/`APP_BASE_NAMESPACES`:
 * that's the ~102 kB raw this split exists to keep off `/library/*`.
 */
export const LIBRARY_NAMESPACES: readonly string[] = [
  ...SHARED_NAMESPACES,
  ...ROOT_APP_NAMESPACES,
  "app.library",
  "app.reportExport",
];
