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
import activitiesEn from "./activities.en.json";
import activitiesId from "./activities.id.json";
import analyticsEn from "./analytics.en.json";
import analyticsId from "./analytics.id.json";
import attendanceEditorEn from "./attendanceEditor.en.json";
import attendanceEditorId from "./attendanceEditor.id.json";
import attendanceReportsEn from "./attendanceReports.en.json";
import attendanceReportsId from "./attendanceReports.id.json";
import auditEn from "./audit.en.json";
import auditId from "./audit.id.json";
import billingEn from "./billing.en.json";
import billingId from "./billing.id.json";
import calendarEn from "./calendar.en.json";
import calendarId from "./calendar.id.json";
import dashboardPersonaEn from "./dashboardPersona.en.json";
import dashboardPersonaId from "./dashboardPersona.id.json";
import disciplineEn from "./discipline.en.json";
import disciplineId from "./discipline.id.json";
import documentsEn from "./documents.en.json";
import documentsId from "./documents.id.json";
import gradingEn from "./grading.en.json";
import gradingId from "./grading.id.json";
import integrationsEn from "./integrations.en.json";
import integrationsId from "./integrations.id.json";
import journalEn from "./journal.en.json";
import journalId from "./journal.id.json";
import libraryEn from "./library.en.json";
import libraryId from "./library.id.json";
import mentoringEn from "./mentoring.en.json";
import mentoringId from "./mentoring.id.json";
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
import reportExportEn from "./reportExport.en.json";
import reportExportId from "./reportExport.id.json";
import reportsEn from "./reports.en.json";
import reportsId from "./reports.id.json";
import securityEn from "./security.en.json";
import securityId from "./security.id.json";
import ssoEn from "./sso.en.json";
import ssoId from "./sso.id.json";
import staffAttendanceEn from "./staffAttendance.en.json";
import staffAttendanceId from "./staffAttendance.id.json";
import supervisionEn from "./supervision.en.json";
import supervisionId from "./supervision.id.json";
import visitorsEn from "./visitors.en.json";
import visitorsId from "./visitors.id.json";
import workflowsEn from "./workflows.en.json";
import workflowsId from "./workflows.id.json";

registerFeatureMessages({
  namespace: "attendanceReports",
  id: attendanceReportsId,
  en: attendanceReportsEn,
});
registerFeatureMessages({
  namespace: "attendanceEditor",
  id: attendanceEditorId,
  en: attendanceEditorEn,
});
registerFeatureMessages({ namespace: "academic", id: academicId, en: academicEn });
registerFeatureMessages({ namespace: "activities", id: activitiesId, en: activitiesEn });
registerFeatureMessages({ namespace: "analytics", id: analyticsId, en: analyticsEn });
registerFeatureMessages({ namespace: "account", id: accountId, en: accountEn });
registerFeatureMessages({ namespace: "calendar", id: calendarId, en: calendarEn });
registerFeatureMessages({
  namespace: "dashboardPersona",
  id: dashboardPersonaId,
  en: dashboardPersonaEn,
});
registerFeatureMessages({ namespace: "billing", id: billingId, en: billingEn });
registerFeatureMessages({ namespace: "discipline", id: disciplineId, en: disciplineEn });
registerFeatureMessages({ namespace: "documents", id: documentsId, en: documentsEn });
registerFeatureMessages({ namespace: "grading", id: gradingId, en: gradingEn });
registerFeatureMessages({ namespace: "integrations", id: integrationsId, en: integrationsEn });
registerFeatureMessages({ namespace: "audit", id: auditId, en: auditEn });
registerFeatureMessages({ namespace: "reports", id: reportsId, en: reportsEn });
registerFeatureMessages({ namespace: "reportExport", id: reportExportId, en: reportExportEn });
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
registerFeatureMessages({
  namespace: "staffAttendance",
  id: staffAttendanceId,
  en: staffAttendanceEn,
});
registerFeatureMessages({ namespace: "visitors", id: visitorsId, en: visitorsEn });
registerFeatureMessages({ namespace: "mentoring", id: mentoringId, en: mentoringEn });
registerFeatureMessages({ namespace: "supervision", id: supervisionId, en: supervisionEn });
