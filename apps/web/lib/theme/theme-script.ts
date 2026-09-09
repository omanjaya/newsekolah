export const THEME_STORAGE_KEY = "newsekolah-theme";

/**
 * Runs before paint via a nonce-carrying inline <script> in app/layout.tsx,
 * so a forced light/dark choice applies immediately instead of flashing the
 * system theme first. Reading localStorage can throw in private-browsing
 * modes that block storage access, so it's wrapped in try/catch and simply
 * falls back to the system theme (no `data-theme` attribute; the CSS in
 * @newsekolah/ui-tokens handles that case).
 */
export function getThemeBootstrapScript(): string {
  return `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
}
