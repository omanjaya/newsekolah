import type { ReactElement } from "react";

import { LegacyLetterRedirect } from "../../../../../features/discipline/components/legacy-letter-redirect";

/**
 * Warning-letter notifications stored before their links were fixed point
 * here; there is no per-letter page, so each reader is sent to the page
 * that shows their letters.
 */
export default function Page(): ReactElement {
  return <LegacyLetterRedirect />;
}
