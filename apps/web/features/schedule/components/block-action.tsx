import { IconButton, UiLink, cn, domainIcons } from "@newsekolah/ui";
import { Repeat } from "lucide-react";
import type { ReactElement } from "react";

import type { HoldPage } from "../schedule-hold";

/**
 * One icon control on a lesson block, labelled for anyone not seeing it.
 * With `lockedReason` the control stays visible and focusable but does
 * nothing, and its tooltip says why (a block that has ended can no longer
 * be edited or deleted), instead of opening a form that can only fail on
 * save.
 */
export function BlockAction({
  label,
  icon,
  danger,
  onClick,
  lockedReason,
}: {
  label: string;
  icon: ReactElement;
  danger?: boolean;
  onClick: () => void;
  lockedReason?: string;
}): ReactElement {
  const locked = lockedReason !== undefined;
  // The reason shows on hover as well as on focus: IconButton keeps a
  // button unavailable for a reason within the pointer's reach, and puts
  // the label before the reason in the tooltip itself.
  return (
    <IconButton
      icon={icon}
      aria-label={label}
      disabledReason={lockedReason}
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("text-fg-muted", !locked && (danger ? "hover:text-danger" : "hover:text-fg"))}
    />
  );
}

/** The icon of the page a locked block links to, as the navigation draws it. */
export function HoldPageIcon({
  page,
  className,
}: {
  page: HoldPage;
  className?: string;
}): ReactElement {
  return page === "substitutions" ? (
    <Repeat className={className} aria-hidden="true" />
  ) : (
    <domainIcons.attendance className={className} aria-hidden="true" />
  );
}

/**
 * A link on a locked lesson block to the record that holds it: the
 * school-wide substitutions list, where a schedule manager cancels a
 * request, or that day's attendance. The disabled edit and delete name the
 * record; this is where the reader acts on it. Sized like the block's
 * "Ajukan pengganti" control, which can sit beside it.
 */
export function BlockLinkAction({
  href,
  label,
  page,
}: {
  href: string;
  label: string;
  page: HoldPage;
}): ReactElement {
  return (
    <IconButton
      asChild
      icon={<HoldPageIcon page={page} />}
      aria-label={label}
      variant="ghost"
      className="size-11 md:size-8"
    >
      <UiLink href={href} />
    </IconButton>
  );
}
