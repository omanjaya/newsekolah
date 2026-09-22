import { sanitize } from "isomorphic-dompurify";
import type { ReactElement } from "react";

import { cn } from "../utils/cn.js";

export interface SafeHtmlProps {
  /**
   * HTML that is already sanitised server-side (e.g. announcement bodies
   * through bluemonday's UGC policy, or a rendered letter template) --
   * never raw, unsanitised user input.
   */
  html: string;
  className?: string;
}

/**
 * The one place in this codebase allowed to call dangerouslySetInnerHTML
 * on tenant/user content (docs/04-clean-code.md section 3), so every such
 * site renders through here instead of dangerouslySetInnerHTML directly.
 * Runs DOMPurify again on the client as defense in depth on top of the
 * server-side sanitiser: a second, independent pass that does not depend
 * on the server-side policy having been applied correctly for every path
 * that can produce this HTML, and that also protects a document surfaced
 * only client-side (e.g. from a cached/stale response). `isomorphic-dompurify`
 * is used rather than plain `dompurify` because this component has no
 * "use client" boundary of its own and can be rendered server-side, where
 * plain `dompurify` has no `window` to sanitise against.
 */
export function SafeHtml({ html, className }: SafeHtmlProps): ReactElement {
  const clean = sanitize(html);
  return <div className={cn(className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}
