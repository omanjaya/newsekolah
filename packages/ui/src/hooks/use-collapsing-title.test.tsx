import { act, cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PageHeader } from "../components/page-header.js";

import { collapsedTitleStore, cssLengthToPx } from "./use-collapsing-title.js";

/** Stands in for IntersectionObserver (jsdom has none) and lets a test report entries. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit | undefined;
  readonly targets: Element[] = [];
  disconnected = false;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  /** Reports the heading as in view, or out of view with its bottom edge at `bottom`. */
  report(isIntersecting: boolean, bottom: number) {
    const entry = {
      isIntersecting,
      boundingClientRect: { bottom } as DOMRectReadOnly,
    } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

const original = globalThis.IntersectionObserver;

beforeAll(() => {
  globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
});

afterAll(() => {
  globalThis.IntersectionObserver = original;
});

afterEach(() => {
  cleanup();
  FakeObserver.instances = [];
});

function latest(): FakeObserver {
  const observer = FakeObserver.instances.at(-1);
  if (!observer) throw new Error("nothing observed");
  return observer;
}

describe("collapsing page title", () => {
  it("offers the page title to the compact header, expanded at first", () => {
    render(<PageHeader title="Jurnal mengajar" />);
    expect(collapsedTitleStore.get()).toEqual({ title: "Jurnal mengajar", collapsed: false });
    expect(latest().targets[0]?.tagName).toBe("H1");
  });

  it("collapses once the title has scrolled away above the header, and expands back", () => {
    render(<PageHeader title="Jurnal mengajar" />);
    act(() => {
      latest().report(false, -10);
    });
    expect(collapsedTitleStore.get()).toEqual({ title: "Jurnal mengajar", collapsed: true });
    act(() => {
      latest().report(true, 120);
    });
    expect(collapsedTitleStore.get().collapsed).toBe(false);
  });

  it("does not collapse for a title below the fold", () => {
    render(<PageHeader title="Jurnal mengajar" />);
    act(() => {
      latest().report(false, 2000);
    });
    expect(collapsedTitleStore.get().collapsed).toBe(false);
  });

  it("names the page with `compactTitle` when the heading is not plain text", () => {
    render(
      <PageHeader
        title={
          <>
            Selamat datang, <strong>Admin</strong>
          </>
        }
        compactTitle="Beranda"
      />,
    );
    expect(collapsedTitleStore.get().title).toBe("Beranda");
  });

  it("leaves the compact header alone when the page opts out", () => {
    render(<PageHeader title="Pratinjau" compactTitle={false} />);
    expect(FakeObserver.instances).toHaveLength(0);
    expect(collapsedTitleStore.get()).toEqual({ title: null, collapsed: false });
  });

  it("clears the title when the page leaves, but never a newer page's", () => {
    const first = render(<PageHeader title="Jadwal" />);
    const second = render(<PageHeader title="Presensi" />);
    // The old page's cleanup runs after the new page has taken over.
    first.unmount();
    expect(collapsedTitleStore.get().title).toBe("Presensi");
    second.unmount();
    expect(collapsedTitleStore.get()).toEqual({ title: null, collapsed: false });
    expect(latest().disconnected).toBe(true);
  });
});

describe("cssLengthToPx", () => {
  it("reads px and rem lengths and ignores anything else", () => {
    expect(cssLengthToPx("56px")).toBe(56);
    expect(cssLengthToPx(" 3.5rem ")).toBe(56);
    expect(cssLengthToPx("2rem", 10)).toBe(20);
    expect(cssLengthToPx("")).toBe(0);
    expect(cssLengthToPx("calc(1px + 2px)")).toBe(0);
  });
});
