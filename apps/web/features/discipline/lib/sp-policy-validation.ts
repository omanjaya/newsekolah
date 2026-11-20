/** What is wrong with one row of the SP ladder, as message keys under app.discipline.policy.errors. */
export interface LevelErrors {
  label?: "labelRequired";
  minPoints?: "pointsRequired" | "pointsMustIncrease";
}

/**
 * Checks the SP ladder the way the API does (SPPolicy.Validate), row by
 * row, so the editor can mark the field at fault instead of only showing
 * "Data yang dikirim tidak valid": every level needs a label and a
 * threshold above 0, and each threshold must be higher than the one
 * before it. Returns one entry per row that has a problem, keyed by index.
 */
export function validateLevels(
  levels: readonly { label: string; minPoints: string }[],
): Map<number, LevelErrors> {
  const errors = new Map<number, LevelErrors>();
  let previous: number | null = null;
  levels.forEach((level, index) => {
    const rowErrors: LevelErrors = {};
    if (level.label.trim() === "") rowErrors.label = "labelRequired";
    const points = level.minPoints.trim() === "" ? Number.NaN : Number(level.minPoints);
    if (!Number.isFinite(points) || points <= 0) {
      rowErrors.minPoints = "pointsRequired";
    } else {
      if (previous !== null && points <= previous) rowErrors.minPoints = "pointsMustIncrease";
      previous = points;
    }
    if (rowErrors.label || rowErrors.minPoints) errors.set(index, rowErrors);
  });
  return errors;
}
