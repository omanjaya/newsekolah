import type { Decorator } from "@storybook/react";

/** The phone the overhaul designs for (spec section 1: 390px). */
const PHONE = { width: 390, height: 844 } as const;

/** Marks the inner document, so the story renders itself there instead of another frame. */
const FRAME_PARAM = "phone-frame";

function insidePhoneFrame(): boolean {
  return new URLSearchParams(window.location.search).has(FRAME_PARAM);
}

/**
 * Renders a story in a 390 x 844 iframe of itself. A 390px box inside the
 * desktop preview still answers every media query as a desktop, so
 * `sm:` layouts, phone-only menus and collapsed breadcrumbs would never
 * show; inside the frame the viewport really is a phone's. The frame
 * follows the toolbar's theme, and its page has the app's 16px gutter.
 * Use it with `layout: "fullscreen"`.
 */
export const phoneViewport: Decorator = (Story, context) => {
  if (insidePhoneFrame()) {
    // The preview's own 24px padding, brought down to the 16px page gutter.
    return (
      <div className="-m-2">
        <Story />
      </div>
    );
  }
  const theme = typeof context.globals.theme === "string" ? context.globals.theme : "light";
  const query = [
    `id=${encodeURIComponent(context.id)}`,
    "viewMode=story",
    `globals=theme:${theme}`,
    `${FRAME_PARAM}=1`,
  ].join("&");
  return (
    <iframe
      title={`${context.title}: ${context.name}`}
      src={`iframe.html?${query}`}
      width={PHONE.width}
      height={PHONE.height}
      className="mx-auto block rounded-xl border border-border bg-bg shadow-2"
    />
  );
};
