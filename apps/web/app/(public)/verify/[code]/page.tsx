import type { ReactElement } from "react";

import { VerifyView } from "../../../../features/permits/components/verify-view";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<ReactElement> {
  const { code } = await params;
  return <VerifyView code={code} />;
}
