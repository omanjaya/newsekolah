/**
 * Starts the download of a signed link that serves its file as an
 * attachment (Content-Disposition: attachment). Navigating the current tab
 * is never blocked as a popup, unlike `window.open` called after an awaited
 * request (outside the click's user activation), and the attachment keeps
 * the page where it is. A module of its own so tests can stand in for it.
 */
export function downloadFromUrl(url: string): void {
  window.location.assign(url);
}
