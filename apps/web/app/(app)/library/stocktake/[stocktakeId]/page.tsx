import type { ReactElement } from "react";

import { StocktakeSessionView } from "../../../../../features/library/components/stocktake-session-view";

export default async function Page({
  params,
}: {
  params: Promise<{ stocktakeId: string }>;
}): Promise<ReactElement> {
  const { stocktakeId } = await params;
  return <StocktakeSessionView stocktakeId={stocktakeId} />;
}
