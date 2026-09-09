/**
 * Import every feature catalog here so it is registered before
 * `getMessages` runs. One line per feature keeps merge conflicts to a
 * single, obvious place.
 */
import { registerFeatureMessages } from "../../lib/i18n/get-messages";

import auditEn from "./audit.en.json";
import auditId from "./audit.id.json";
import disciplineEn from "./discipline.en.json";
import disciplineId from "./discipline.id.json";
import gradingEn from "./grading.en.json";
import gradingId from "./grading.id.json";
import onboardingEn from "./onboarding.en.json";
import onboardingId from "./onboarding.id.json";
import reportsEn from "./reports.en.json";
import reportsId from "./reports.id.json";
import securityEn from "./security.en.json";
import securityId from "./security.id.json";

registerFeatureMessages({ namespace: "discipline", id: disciplineId, en: disciplineEn });
registerFeatureMessages({ namespace: "grading", id: gradingId, en: gradingEn });
registerFeatureMessages({ namespace: "audit", id: auditId, en: auditEn });
registerFeatureMessages({ namespace: "reports", id: reportsId, en: reportsEn });
registerFeatureMessages({ namespace: "onboarding", id: onboardingId, en: onboardingEn });
registerFeatureMessages({ namespace: "security", id: securityId, en: securityEn });
