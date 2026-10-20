const PERMIT_TYPES = ["leave", "exit", "late"];

function inboxPath(type: string | null): string {
  return type !== null && PERMIT_TYPES.includes(type) ? `/inbox?type=${type}` : "/inbox";
}

/**
 * Where an old review-queue link lands in the inbox: the retired "all queue"
 * view (`type=allQueue`) or a per-type queue tab (`tab=queue`). A type the
 * link selected is kept; otherwise a queue tab means the page's own type.
 * Returns null for any other URL.
 */
export function legacyQueueTarget(params: URLSearchParams, pageType: string): string | null {
  const type = params.get("type");
  if (type === "allQueue") return "/inbox";
  if (params.get("tab") !== "queue") return null;
  return inboxPath(type !== null && PERMIT_TYPES.includes(type) ? type : pageType);
}

/** The inbox entry for a reviewer who has nothing to submit on this page. */
export function reviewerInboxTarget(pageType: string): string {
  return inboxPath(pageType);
}
