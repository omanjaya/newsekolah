import type { ReactElement } from "react";

import { MemberHistoryView } from "../../../../../features/library/components/member-history-view";

export default async function Page({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<ReactElement> {
  const { userId } = await params;
  return <MemberHistoryView userId={userId} />;
}
