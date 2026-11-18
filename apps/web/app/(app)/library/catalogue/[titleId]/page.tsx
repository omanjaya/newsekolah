import type { ReactElement } from "react";

import { TitleDetailView } from "../../../../../features/library/components/title-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ titleId: string }>;
}): Promise<ReactElement> {
  const { titleId } = await params;
  return <TitleDetailView titleId={titleId} />;
}
