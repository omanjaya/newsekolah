import type { ReactElement } from "react";

import { ClubDetailView } from "../../../../../features/activities/components/club-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ clubId: string }>;
}): Promise<ReactElement> {
  const { clubId } = await params;
  return <ClubDetailView clubId={clubId} />;
}
