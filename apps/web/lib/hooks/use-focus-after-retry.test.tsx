import { Button } from "@newsekolah/ui";
import { act, render, screen } from "@testing-library/react";
import { useRef, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { useFocusAfterRetry } from "./use-focus-after-retry";

/** A hero region: the retry while `placement` is set, else the hero's own link. */
function Region({
  retrying,
  placement,
  onArm,
}: {
  retrying: boolean;
  placement: string | null;
  onArm: (arm: () => void) => void;
}): ReactElement {
  const region = useRef<HTMLDivElement>(null);
  const arm = useFocusAfterRetry(region, retrying, placement);
  return (
    <div ref={region}>
      {placement ? (
        <button
          type="button"
          disabled={retrying}
          data-retry-focus=""
          onClick={() => {
            onArm(arm);
          }}
        >
          Coba lagi
        </button>
      ) : (
        <a href="/attendance">Isi presensi</a>
      )}
    </div>
  );
}

function setup() {
  let arm: () => void = () => undefined;
  const onArm = (next: () => void) => {
    arm = next;
  };
  const view = render(<Region retrying={false} placement="hero" onArm={onArm} />);
  const button = screen.getByRole("button", { name: "Coba lagi" });
  button.focus();
  act(() => {
    button.click();
    arm();
  });
  const rerender = (retrying: boolean, placement: string | null) => {
    view.rerender(<Region retrying={retrying} placement={placement} onArm={onArm} />);
  };
  return { rerender };
}

describe("useFocusAfterRetry", () => {
  it("brings focus back to the retry when the run settles and it is still offered", () => {
    const { rerender } = setup();
    rerender(true, "hero");
    (document.activeElement as HTMLElement | null)?.blur();

    rerender(false, "hero");
    expect(screen.getByRole("button", { name: "Coba lagi" })).toHaveFocus();
  });

  it("moves focus to the region's first control once the retry is gone", () => {
    const { rerender } = setup();
    rerender(false, null);
    expect(screen.getByRole("link", { name: "Isi presensi" })).toHaveFocus();
  });

  it("leaves focus the reader moved elsewhere alone", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const { rerender } = setup();
    outside.focus();

    rerender(false, null);
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it("keeps focus on the shared Button while its retry runs", () => {
    // A real browser blurs a button the moment it gains `disabled`, which
    // left focus on <body> for the whole run (audit r6-n2). The busy
    // Button must stay focusable instead.
    function HeroRetry({ retrying }: { retrying: boolean }): ReactElement {
      const region = useRef<HTMLDivElement>(null);
      const arm = useFocusAfterRetry(region, retrying, "hero");
      return (
        <div ref={region}>
          <Button loading={retrying} onClick={arm} data-retry-focus="">
            Coba lagi
          </Button>
        </div>
      );
    }
    const view = render(<HeroRetry retrying={false} />);
    const button = screen.getByRole("button", { name: "Coba lagi" });
    button.focus();
    act(() => {
      button.click();
    });
    view.rerender(<HeroRetry retrying />);
    expect(button).not.toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveFocus();

    view.rerender(<HeroRetry retrying={false} />);
    expect(button).toHaveFocus();
  });
});
