import type { ReactElement } from "react";

import { OpacTitleView } from "../../../../features/library/components/opac-title-view";

export default async function Page({
  params,
}: {
  params: Promise<{ titleId: string }>;
}): Promise<ReactElement> {
  const { titleId } = await params;
  return <OpacTitleView titleId={titleId} />;
}
