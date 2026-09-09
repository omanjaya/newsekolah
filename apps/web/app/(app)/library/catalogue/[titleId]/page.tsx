import type { ReactElement } from "react";

import { TitleCopiesView } from "../../../../../features/library/components/title-copies-view";

export default async function Page({
  params,
}: {
  params: Promise<{ titleId: string }>;
}): Promise<ReactElement> {
  const { titleId } = await params;
  return <TitleCopiesView titleId={titleId} />;
}
