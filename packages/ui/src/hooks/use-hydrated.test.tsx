import { act, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useHydrated } from "./use-hydrated.js";

function Probe() {
  return <output>{useHydrated() ? "hydrated" : "server"}</output>;
}

describe("useHydrated", () => {
  it("is false in the server markup", () => {
    expect(renderToString(<Probe />)).toContain("server");
  });

  it("turns true once the server markup hydrates, without a mismatch", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Probe />);
    document.body.appendChild(container);
    const errors: unknown[] = [];

    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Probe />, {
        onRecoverableError: (error) => {
          errors.push(error);
        },
      });
      await Promise.resolve();
    });

    expect(container).toHaveTextContent("hydrated");
    expect(errors).toEqual([]);
    act(() => {
      root?.unmount();
    });
    container.remove();
  });

  it("is true from the first render of a client-only mount", () => {
    render(<Probe />);
    expect(screen.getByText("hydrated")).toBeInTheDocument();
  });
});
