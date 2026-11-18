import { render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";

import { DataTableStateProvider } from "./data-table-state.js";

let mounts = 0;

function MountProbe() {
  const [id] = useState(() => Math.random().toString(36).slice(2));
  useEffect(() => {
    mounts += 1;
  }, []);
  return <output data-id={id}>probe</output>;
}

describe("DataTableStateProvider", () => {
  // The app wraps its whole shell in this provider and puts the current
  // page in the scope; a keyed remount made the shell (sidebar, header,
  // command palette) start over on every client navigation.
  it("keeps everything under it mounted when the scope changes", () => {
    mounts = 0;
    const view = render(
      <DataTableStateProvider scope="tenant:user:year:/inbox">
        <MountProbe />
      </DataTableStateProvider>,
    );
    const probe = screen.getByText("probe");
    const id = probe.dataset.id;

    view.rerender(
      <DataTableStateProvider scope="tenant:user:year:/billing">
        <MountProbe />
      </DataTableStateProvider>,
    );
    view.rerender(
      <DataTableStateProvider scope="tenant:other-user:year:/billing">
        <MountProbe />
      </DataTableStateProvider>,
    );

    expect(mounts).toBe(1);
    expect(screen.getByText("probe")).toBe(probe);
    expect(screen.getByText("probe").dataset.id).toBe(id);
  });
});
