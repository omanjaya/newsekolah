export const THEME_COLOR = { light: "#F7F6F2", dark: "#171613" } as const;

/**
 * Next renders one `<meta name="theme-color" media="...">` per colour scheme,
 * which follows the operating system only. When the reader forces light or
 * dark, every such tag is pinned to that theme's colour so the browser bar
 * matches the page; "system" restores what the server rendered.
 */
export function applyThemeColor(theme: "system" | "light" | "dark"): void {
  const tags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  for (const tag of tags) {
    tag.dataset.systemContent ??= tag.content;
    tag.content = theme === "system" ? tag.dataset.systemContent : THEME_COLOR[theme];
  }
}
