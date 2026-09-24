import type { components } from "@newsekolah/api-client";

type Audience = components["schemas"]["Audience"];

/**
 * Renders an `Audience` as one line of text -- who this announcement
 * reaches -- shared by the manage table's "reach" column and the
 * composer's own preview, so the two never describe the same audience
 * value differently.
 */
export function describeAudience(
  audience: Audience,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  switch (audience.type) {
    case "all":
      return t("form.audienceAll");
    case "roles":
      return (audience.role_slugs ?? []).map((slug) => t(`roles.${slug}`)).join(", ");
    case "classes":
      return t("audienceClassCount", { count: audience.class_ids?.length ?? 0 });
    case "users":
      return t("audienceUserCount", { count: audience.user_ids?.length ?? 0 });
  }
}
