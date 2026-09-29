import type { ReactElement } from "react";

import { ViolationsView } from "../../../../features/library/components/violations-view";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}): Promise<ReactElement> {
  const { member } = await searchParams;
  return <ViolationsView memberUserId={member} />;
}
