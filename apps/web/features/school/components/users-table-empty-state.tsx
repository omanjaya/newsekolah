import { Button, EmptyState, domainIcons } from "@newsekolah/ui";
import type { ReactElement } from "react";

interface UsersTableEmptyStateProps {
  isError: boolean;
  emptyTitle: string;
  emptyBody: string;
  loadErrorTitle: string;
  loadErrorBody: string;
  retryLabel: string;
  onRetry: () => void;
}

export function UsersTableEmptyState({
  isError,
  emptyTitle,
  emptyBody,
  loadErrorTitle,
  loadErrorBody,
  retryLabel,
  onRetry,
}: UsersTableEmptyStateProps): ReactElement {
  if (!isError) {
    return (
      <EmptyState
        icon={<domainIcons.users aria-hidden="true" />}
        title={emptyTitle}
        description={emptyBody}
      />
    );
  }

  return (
    <EmptyState
      icon={<domainIcons.users aria-hidden="true" />}
      title={loadErrorTitle}
      description={loadErrorBody}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      }
    />
  );
}
