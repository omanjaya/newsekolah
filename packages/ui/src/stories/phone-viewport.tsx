import type { Decorator } from "@storybook/react";

/** The phone the overhaul designs for (spec section 1: 390px). */
const PHONE = { width: 390, height: 844 } as const;

/** Marks the inner document, so the story renders itself there instead of another frame. */
const FRAME_PARAM = "phone-frame";

function insidePhoneFrame(): boolean {
  return new URLSearchParams(window.location.search).has(FRAME_PARAM);
}

function frameSrc(id: string, theme: string): string {
  return [
    `iframe.html?id=${encodeURIComponent(id)}`,
    "viewMode=story",
    `globals=theme:${theme}`,
    `${FRAME_PARAM}=1`,
  ].join("&");
}

/**
 * Renders a story in an iframe of itself per width, each 844px tall, side
 * by side. A narrow box inside the desktop preview still answers every
 * media query as a desktop, so `sm:` layouts, phone-only menus and
 * collapsed breadcrumbs would never show; inside a frame the viewport
 * really is a phone's. The frames follow the toolbar's theme, and their
 * page has the app's 16px gutter. Use it with `layout: "fullscreen"`.
 */
export function phoneViewportsAt(widths: readonly number[]): Decorator {
  return (Story, context) => {
    if (insidePhoneFrame()) {
      // The preview's own 24px padding, brought down to the 16px page gutter.
      return (
        <div className="-m-2">
          <Story />
        </div>
      );
    }
    const theme = typeof context.globals.theme === "string" ? context.globals.theme : "light";
    return (
      <div className="flex flex-wrap items-start justify-center gap-6">
        {widths.map((width) => (
          <iframe
            key={width}
            title={`${context.title}: ${context.name} (${String(width)}px)`}
            src={frameSrc(context.id, theme)}
            width={width}
            height={PHONE.height}
            className="block rounded-xl border border-border bg-bg shadow-2"
          />
        ))}
      </div>
    );
  };
}

/** The story in a 390 x 844 iframe of itself, the phone the overhaul designs for. */
export const phoneViewport: Decorator = phoneViewportsAt([PHONE.width]);
