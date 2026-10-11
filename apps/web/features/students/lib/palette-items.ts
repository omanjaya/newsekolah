import type { CommandPaletteItem } from "@newsekolah/ui";
import type { ReactNode } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import type { StudentSearchHit } from "../api";

/**
 * One command palette row per student found. The directory carries the
 * username (the sign-in handle schools issue from the NIS) but neither class
 * nor NIS, so the username is the secondary text and also a search keyword:
 * the palette filters rows client-side, and a query typed as a username must
 * still match a row whose name does not contain it.
 */
export function studentPaletteItems(
  hits: readonly StudentSearchHit[],
  options: { icon: ReactNode; onSelect: (studentId: string) => void },
): CommandPaletteItem[] {
  return hits.map((hit) => ({
    id: `student-${hit.id}`,
    label: `${formatDisplayName(hit.name)} (${hit.username})`,
    keywords: [hit.name, hit.username],
    icon: options.icon,
    onSelect: () => {
      options.onSelect(hit.id);
    },
  }));
}
