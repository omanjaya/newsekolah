import { getRequestConfig } from "next-intl/server";

import { getMessages } from "../lib/i18n/get-messages";
import "../messages/features";
import { getTenantBrandingServer } from "../lib/tenant/get-branding.server";

// next-intl needs this file (registered in next.config.ts) so server
// components can call useTranslations/getTranslations; the locale comes from
// tenant branding, the same source the root layout uses for the client provider.
// The time zone is the school's too: without it next-intl formats in the
// server's zone (UTC), and every client provider rendered from a server
// layout inherits that, so an instant read in WIB or WITA lands on the
// wrong day near midnight. The fallback is the tenants table default
// (docs/06-database-schema.md).
const DEFAULT_TIME_ZONE = "Asia/Makassar";

// eslint-disable-next-line import/no-default-export -- next-intl requires a default export here
export default getRequestConfig(async () => {
  const branding = await getTenantBrandingServer();
  const locale = branding?.locale ?? "id";
  return {
    locale,
    timeZone: branding?.timezone ?? DEFAULT_TIME_ZONE,
    messages: getMessages(locale),
  };
});
