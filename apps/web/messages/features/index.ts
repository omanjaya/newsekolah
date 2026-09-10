/**
 * Import every feature catalog here so it is registered before
 * `getMessages` runs. One line per feature keeps merge conflicts to a
 * single, obvious place.
 */
import { registerFeatureMessages } from "../../lib/i18n/get-messages";

import academicEn from "./academic.en.json";
import academicId from "./academic.id.json";
import accountEn from "./account.en.json";
import accountId from "./account.id.json";
import attendanceReportsEn from "./attendanceReports.en.json";
import attendanceReportsId from "./attendanceReports.id.json";
import auditEn from "./audit.en.json";
import auditId from "./audit.id.json";
import calendarEn from "./calendar.en.json";
import calendarId from "./calendar.id.json";
import disciplineEn from "./discipline.en.json";
import disciplineId from "./discipline.id.json";
import documentsEn from "./documents.en.json";
import documentsId from "./documents.id.json";
import familyEn from "./family.en.json";
import familyId from "./family.id.json";
import gradingEn from "./grading.en.json";
import gradingId from "./grading.id.json";
import integrationsEn from "./integrations.en.json";
import integrationsId from "./integrations.id.json";
import journalEn from "./journal.en.json";
import journalId from "./journal.id.json";
import libraryEn from "./library.en.json";
import libraryId from "./library.id.json";
import messagingEn from "./messaging.en.json";
import messagingId from "./messaging.id.json";
import monitorEn from "./monitor.en.json";
import monitorId from "./monitor.id.json";
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
import workflowsEn from "./workflows.en.json";
import workflowsId from "./workflows.id.json";

registerFeatureMessages({
  namespace: "attendanceReports",
  id: attendanceReportsId,
  en: attendanceReportsEn,
});
registerFeatureMessages({ namespace: "academic", id: academicId, en: academicEn });
registerFeatureMessages({ namespace: "account", id: accountId, en: accountEn });
registerFeatureMessages({ namespace: "calendar", id: calendarId, en: calendarEn });
registerFeatureMessages({ namespace: "discipline", id: disciplineId, en: disciplineEn });
registerFeatureMessages({ namespace: "family", id: familyId, en: familyEn });
registerFeatureMessages({ namespace: "documents", id: documentsId, en: documentsEn });
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
registerFeatureMessages({ namespace: "workflows", id: workflowsId, en: workflowsEn });
registerFeatureMessages({ namespace: "messaging", id: messagingId, en: messagingEn });
registerFeatureMessages({ namespace: "journal", id: journalId, en: journalEn });
registerFeatureMessages({ namespace: "monitor", id: monitorId, en: monitorEn });
