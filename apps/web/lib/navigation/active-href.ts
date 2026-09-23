/** True when `pathname` is `href` itself or a page nested below it. */
export function matchesHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The one navigation href that owns `pathname`: the longest href that
 * matches it. Prefix matching alone marks every ancestor active too (on
 * `/library/copies` both "/library" and "/library/copies" match), so
 * menus highlight only this best match, across all of their groups.
 */
export function activeNavHref(
  pathname: string,
  items: readonly { href: string }[],
): string | undefined {
  let best: string | undefined;
  for (const { href } of items) {
    if (matchesHref(pathname, href) && (best === undefined || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
