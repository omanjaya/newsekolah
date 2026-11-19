import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";

import { OpacGate } from "../../../features/library/components/opac-gate";
import { OpacView } from "../../../features/library/components/opac-view";
import { pageTitleMetadata } from "../../../lib/i18n/page-metadata";

// On the page, not a layout: a book's page names its tab after the book
// once it loads (OpacTitleView), so it must not inherit this title.
export function generateMetadata(): Promise<Metadata> {
  return pageTitleMetadata("app.library.opac", "title");
}

export default function Page(): ReactElement {
  return (
    <OpacGate>
      {/* OpacView keeps its search in the address via useSearchParams, which needs a Suspense boundary. */}
      <Suspense>
        <OpacView />
      </Suspense>
    </OpacGate>
  );
}
