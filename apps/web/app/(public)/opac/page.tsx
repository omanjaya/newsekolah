import type { ReactElement } from "react";

import { OpacGate } from "../../../features/library/components/opac-gate";
import { OpacView } from "../../../features/library/components/opac-view";

export default function Page(): ReactElement {
  return (
    <OpacGate>
      <OpacView />
    </OpacGate>
  );
}
