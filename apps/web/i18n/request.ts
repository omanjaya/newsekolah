import { getRequestConfig } from "next-intl/server";

import { getMessages } from "../lib/i18n/get-messages";
import { getTenantBrandingServer } from "../lib/tenant/get-branding.server";

// next-intl needs this file (registered in next.config.ts) so server
// components can call useTranslations/getTranslations; the locale comes from
// tenant branding, the same source the root layout uses for the client provider.
// eslint-disable-next-line import/no-default-export -- next-intl requires a default export here
export default getRequestConfig(async () => {
  const branding = await getTenantBrandingServer();
  const locale = branding?.locale ?? "id";
  return { locale, messages: getMessages(locale) };
});
