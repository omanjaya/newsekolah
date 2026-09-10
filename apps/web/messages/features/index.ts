/**
 * Import every feature catalog here so it is registered before
 * `getMessages` runs. One line per feature keeps merge conflicts to a
 * single, obvious place.
 */
import { registerFeatureMessages } from "../../lib/i18n/get-messages";

import academicEn from "./academic.en.json";
import academicId from "./academic.id.json";
import auditEn from "./audit.en.json";
import auditId from "./audit.id.json";
import calendarEn from "./calendar.en.json";
import calendarId from "./calendar.id.json";
import disciplineEn from "./discipline.en.json";
import disciplineId from "./discipline.id.json";
import gradingEn from "./grading.en.json";
import gradingId from "./grading.id.json";
import integrationsEn from "./integrations.en.json";
import integrationsId from "./integrations.id.json";
import libraryEn from "./library.en.json";
import libraryId from "./library.id.json";
import messagingEn from "./messaging.en.json";
import messagingId from "./messaging.id.json";
import onboardingEn from "./onboarding.en.json";
import onboardingId from "./onboarding.id.json";
import platformEn from "./platform.en.json";
import platformId from "./platform.id.json";
import promotionEn from "./promotion.en.json";
import promotionId from "./promotion.id.json";
import reportsEn from "./reports.en.json";
import reportsId from "./reports.id.json";
import securityEn from "./security.en.json";
import securityId from "./security.id.json";
import ssoEn from "./sso.en.json";
import ssoId from "./sso.id.json";

registerFeatureMessages({ namespace: "academic", id: academicId, en: academicEn });
registerFeatureMessages({ namespace: "calendar", id: calendarId, en: calendarEn });
registerFeatureMessages({ namespace: "discipline", id: disciplineId, en: disciplineEn });
registerFeatureMessages({ namespace: "grading", id: gradingId, en: gradingEn });
registerFeatureMessages({ namespace: "integrations", id: integrationsId, en: integrationsEn });
registerFeatureMessages({ namespace: "audit", id: auditId, en: auditEn });
registerFeatureMessages({ namespace: "reports", id: reportsId, en: reportsEn });
registerFeatureMessages({ namespace: "onboarding", id: onboardingId, en: onboardingEn });
registerFeatureMessages({ namespace: "promotion", id: promotionId, en: promotionEn });
registerFeatureMessages({ namespace: "security", id: securityId, en: securityEn });
registerFeatureMessages({ namespace: "sso", id: ssoId, en: ssoEn });
registerFeatureMessages({ namespace: "platform", id: platformId, en: platformEn });
registerFeatureMessages({ namespace: "library", id: libraryId, en: libraryEn });
registerFeatureMessages({ namespace: "messaging", id: messagingId, en: messagingEn });
