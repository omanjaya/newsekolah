"use client";

import { NumberInput } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { fromText, toText } from "../lib/number-text";
import type { TPRangeProblem, TPRangeText } from "../lib/tp-ranges";

/** The school's grading scale as the range inputs need it. */
export interface RangeScale {
  min: number;
  max: number;
  /** `round_decimal`: how many decimals a bound may carry ("59,5"). */
  decimals: number;
}

/**
 * The min and max of one range (R or T), each labelled for assistive tech.
 * Bounded by the school's scale and kept to its decimals, so "59,5" and
 * "59.5" both read as 59.5 (with no precision the field read the point as
 * a thousands separator and sent 595).
 */
export function RangeInputs({
  range,
  row,
  scale,
  invalid,
  errorId,
  onChange,
  inputClassName,
}: {
  range: "r" | "t";
  row: TPRangeText;
  scale: RangeScale;
  invalid: boolean;
  errorId: string;
  onChange: (patch: Partial<TPRangeText>) => void;
  inputClassName: string;
}): ReactElement {
  const t = useTranslations("app.grading.tpMapping");
  const minKey = range === "r" ? "r_min" : "t_min";
  const maxKey = range === "r" ? "r_max" : "t_max";
  const bounds = {
    min: scale.min,
    max: scale.max,
    precision: scale.decimals,
    invalid,
    "aria-describedby": invalid ? errorId : undefined,
  };
  return (
    <div className="flex items-center gap-1">
      <NumberInput
        {...bounds}
        className={inputClassName}
        aria-label={t(range === "r" ? "columns.rMin" : "columns.tMin")}
        value={fromText(row[minKey])}
        onChange={(value) => {
          onChange({ [minKey]: toText(value) });
        }}
      />
      <span className="text-fg-muted">-</span>
      <NumberInput
        {...bounds}
        className={inputClassName}
        aria-label={t(range === "r" ? "columns.rMax" : "columns.tMax")}
        value={fromText(row[maxKey])}
        onChange={(value) => {
          onChange({ [maxKey]: toText(value) });
        }}
      />
    </div>
  );
}

/** Names the rule a row's ranges break, under the inputs it marks invalid. */
export function RangeProblem({
  id,
  problem,
  scale,
}: {
  id: string;
  problem: TPRangeProblem | null;
  scale: RangeScale;
}): ReactElement | null {
  const t = useTranslations("app.grading.tpMapping");
  if (!problem) return null;
  return (
    <p id={id} role="alert" className="text-caption text-danger">
      {t(`problem.${problem}`, { min: scale.min, max: scale.max })}
    </p>
  );
}
