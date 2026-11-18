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

import { navigation } from "../navigation";
import { libraryNavItems } from "../navigation-library";
import { WORKSPACE_MEMBER_KEYS } from "../navigation-workspaces";

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
  // The page template, the state pages and the kiosk frame: read by every
  // `(app)` screen, the library screens under their own provider, and `(kiosk)`.
  "app.page",
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
  "app.workspace",
  "app.serviceWorkspace",
  "app.academic",
  "app.activities",
  "app.analytics",
  "app.attendanceEditor",
  "app.attendanceReports",
  "app.audit",
  "app.bell",
  "app.billing",
  "app.calendar",
  "app.dashboardDuty",
  "app.dashboardSchool",
  "app.dashboardStudent",
  "app.dashboardTeaching",
  "app.discipline",
  "app.documents",
  "app.grading",
  "app.inbox",
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
  "app.studentProfile",
  "app.quickActions",
  "app.staffAttendance",
  "app.scan",
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
  "app.moduleUnavailable",
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
 * registry so a new library screen can't silently lose its nav label, the
 * shorter one under the group heading included.
 */
const LIBRARY_NAV_LABEL_KEYS = libraryNavItems
  .flatMap((item) => [item.labelKey, item.groupLabelKey])
  .filter((labelKey): labelKey is string => labelKey?.startsWith("app.library.") ?? false);

/**
 * The student profile's library tab (`/students/[studentId]`) reuses the
 * member-detail loan row, which reads these three slices of the `library`
 * catalog; the rest of that catalog stays scoped to `/library/*`.
 */
const STUDENT_PROFILE_LIBRARY_NAMESPACES = [
  "app.library.memberDetail",
  "app.library.memberHistory",
  "app.library.dueBadge",
] as const;

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
  ...STUDENT_PROFILE_LIBRARY_NAMESPACES,
  "app.settingsHub",
  // The library settings sidebar label, read outside /library/* too.
  "app.librarySettings.title",
];

/**
 * `(app)/library/layout.tsx`'s provider: the shared catalog and the
 * root-level `app.*` namespaces (library screens still render inside
 * `(app)`'s shell — nothing there needs re-provisioning — but they do use
 * `QueryError`/`common`/`errors`), plus the *full* `library` catalog in
 * place of the `app.library.opac` sliver the root carries for `/opac`.
 * Deliberately does not include `APP_FEATURE_NAMESPACES`/`APP_BASE_NAMESPACES`:
 * that's the ~102 kB raw this split exists to keep off `/library/*`; only
 * the labels of the tabs a library screen shares a strip with ride along
 * (`LIBRARY_STRIP_LABEL_KEYS` below).
 */
const LIBRARY_BASE_NAMESPACES: readonly string[] = [
  "app.workspace",
  ...SHARED_NAMESPACES,
  ...ROOT_APP_NAMESPACES,
  "app.library",
  "app.reportExport",
  "app.librarySettings",
];

/** Whether `key` already rides along with one of `namespaces` (itself or a parent). */
function coveredBy(namespaces: readonly string[], key: string): boolean {
  return namespaces.some((namespace) => key === namespace || key.startsWith(`${namespace}.`));
}

const LIBRARY_ITEM_KEYS: ReadonlySet<string> = new Set(libraryNavItems.map((item) => item.key));

/**
 * A library screen can sit in a tab strip with pages from other areas (the
 * reports hub puts the library report beside the school's and the visitors'
 * recap), and the page template labels every tab of that strip. Those
 * sibling labels ride along here, derived from the workspace registry so a
 * new mixed strip cannot silently show a raw key on its library tab.
 */
const LIBRARY_STRIP_LABEL_KEYS = WORKSPACE_MEMBER_KEYS.filter((members) =>
  members.some((key) => LIBRARY_ITEM_KEYS.has(key)),
)
  .flat()
  .map((key) => navigation.find((item) => item.key === key)?.labelKey)
  .filter(
    (labelKey): labelKey is string =>
      labelKey !== undefined && !coveredBy(LIBRARY_BASE_NAMESPACES, labelKey),
  );

/** `(app)/library/layout.tsx`'s provider (see `LIBRARY_BASE_NAMESPACES`). */
export const LIBRARY_NAMESPACES: readonly string[] = [
  ...LIBRARY_BASE_NAMESPACES,
  ...new Set(LIBRARY_STRIP_LABEL_KEYS),
];

/**
 * `(kiosk)/layout.tsx`'s provider: the wall monitor and the two library
 * kiosks, which render without the app shell. The shared catalog and the
 * root-level `app.*` namespaces (the frame reads `app.page`, the screens
 * `QueryError`), the three screens' own slices, and the access states the
 * frame shows in place of a screen the reader may not open.
 */
export const KIOSK_NAMESPACES: readonly string[] = [
  ...SHARED_NAMESPACES,
  ...ROOT_APP_NAMESPACES,
  "app.forbidden",
  "app.moduleUnavailable",
  "app.monitor",
  "app.library.kiosk",
  "app.library.visitKiosk",
];
