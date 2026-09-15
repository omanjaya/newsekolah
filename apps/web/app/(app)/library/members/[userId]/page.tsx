import type { ReactElement } from "react";

import { MemberDetailView } from "../../../../../features/library/components/member-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<ReactElement> {
  const { userId } = await params;
  return <MemberDetailView userId={userId} />;
}
