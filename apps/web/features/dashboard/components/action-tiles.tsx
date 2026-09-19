"use client";

import { Badge } from "@newsekolah/ui";
import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

export interface ActionTile {
  key: string;
  href: string;
  label: string;
  count: number;
  hint: string;
}

/** Keep every authorised queue available, including on a day with nothing pending. */
export function ActionTiles({
  tiles,
  clearLabel,
}: {
  tiles: ActionTile[];
  clearLabel: string;
}): ReactElement {
  const total = tiles.reduce((sum, tile) => sum + tile.count, 0);
  return (
    <div>
      {total === 0 && (
        <p className="mb-2 flex items-center gap-2 text-[12px] text-fg-muted">
          <Check className="size-4 shrink-0" aria-hidden="true" />
          {clearLabel}
        </p>
      )}
      <ul className="grid gap-x-5 sm:grid-cols-2">
        {tiles.map((tile) => (
          <li
            key={tile.key}
            className="border-b border-border last:border-b-0 sm:nth-last-2:border-b-0"
          >
            <Link
              href={tile.href}
              className="group -mx-2 flex min-h-14 items-center gap-3 rounded-xs px-2 py-2 hover:bg-bg"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-fg">{tile.label}</span>
                <span className="block text-[12px] text-fg-muted">{tile.hint}</span>
              </span>
              <Badge variant={tile.count > 0 ? "accent" : "neutral"}>{tile.count}</Badge>
              <ArrowUpRight
                className="size-4 shrink-0 text-fg-muted group-hover:text-fg"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
