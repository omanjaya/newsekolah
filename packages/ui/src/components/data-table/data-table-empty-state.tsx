import { Button } from "../button.js";

export function DataTableSearchEmptyState({
  title,
  description,
  clearLabel,
  onClear,
}: {
  title: string;
  description: string;
  clearLabel: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-sm border border-dashed border-border p-10 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-medium text-fg">{title}</p>
        <p className="text-[13px] text-fg-muted">{description}</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onClear}>
        {clearLabel}
      </Button>
    </div>
  );
}
