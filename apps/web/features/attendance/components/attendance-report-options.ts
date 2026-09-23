import type { ClassRef, GradeLevel } from "../../reference/api";

export const STATUS_TOKEN: Record<
  string,
  "present" | "sick" | "excused" | "dispensation" | "absent" | "late"
> = {
  H: "present",
  S: "sick",
  I: "excused",
  D: "dispensation",
  A: "absent",
  INCOMPLETE: "late",
};

export function classOptions(classes: ClassRef[] | undefined) {
  return (classes ?? []).map((item) => ({ value: item.id, label: item.name }));
}

export function gradeLevelOptions(gradeLevels: GradeLevel[] | undefined) {
  return (gradeLevels ?? []).map((item) => ({ value: item.id, label: item.name }));
}
