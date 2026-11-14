import { THEME_COLOR } from "./theme-color";

export const THEME_STORAGE_KEY = "newsekolah-theme";

/**
 * Runs before paint via a nonce-carrying inline <script> in app/layout.tsx,
 * so a forced light/dark choice applies immediately instead of flashing the
 * system theme first. Reading localStorage can throw in private-browsing
 * modes that block storage access, so it's wrapped in try/catch and simply
 * falls back to the system theme (no `data-theme` attribute; the CSS in
 * @newsekolah/ui-tokens handles that case).
 *
 * A forced theme also pins the browser's `theme-color` (the status bar of
 * an installed app) to that theme's page colour right away, and again once
 * the document has parsed, since Next may write the meta tags after this
 * script. Each tag keeps its system colour in `data-system-content`, the
 * same place `applyThemeColor` (theme-color.ts) restores it from.
 */
export function getThemeBootstrapScript(): string {
  return `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);var c=t==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}";var pin=function(){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){if(m[i].dataset.systemContent===undefined){m[i].dataset.systemContent=m[i].content;}m[i].content=c;}};pin();document.addEventListener("DOMContentLoaded",pin);}}catch(e){}})();`;
}
