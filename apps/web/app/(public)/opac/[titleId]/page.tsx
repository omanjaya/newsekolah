import type { ReactElement } from "react";

import { OpacGate } from "../../../../features/library/components/opac-gate";
import { OpacTitleView } from "../../../../features/library/components/opac-title-view";

export default async function Page({
  params,
}: {
  params: Promise<{ titleId: string }>;
}): Promise<ReactElement> {
  const { titleId } = await params;
  return (
    <OpacGate>
      <OpacTitleView titleId={titleId} />
    </OpacGate>
  );
}
