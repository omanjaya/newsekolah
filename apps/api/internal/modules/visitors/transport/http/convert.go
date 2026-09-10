package http

import (
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
)

func toAPIExpectedGuest(g domain.ExpectedGuest) api.ExpectedGuest {
	return api.ExpectedGuest{
		Id: g.ID, FullName: g.FullName, Organization: g.Organization, HostUserId: g.HostUserID, Purpose: g.Purpose,
		ExpectedDate: openapi_types.Date{Time: g.ExpectedDate}, Notes: g.Notes, Status: api.ExpectedGuestStatus(g.Status),
		CreatedBy: g.CreatedBy, CreatedAt: g.CreatedAt,
	}
}

func toAPIExpectedGuests(rows []domain.ExpectedGuest) []api.ExpectedGuest {
	out := make([]api.ExpectedGuest, len(rows))
	for i, g := range rows {
		out[i] = toAPIExpectedGuest(g)
	}
	return out
}

func toAPIVisit(v domain.Visit) api.Visit {
	out := api.Visit{
		Id: v.ID, FullName: v.FullName, Organization: v.Organization, HostUserId: v.HostUserID, Purpose: v.Purpose,
		IdChecked: v.IDChecked, IdType: api.VisitIdType(v.IDType), BadgeNumber: v.BadgeNumber,
		ArrivedAt: v.ArrivedAt, DepartedAt: v.DepartedAt, CheckedInBy: v.CheckedInBy, OnCampus: v.OnCampus(),
	}
	if v.ExpectedGuestID.Valid {
		id := openapi_types.UUID(v.ExpectedGuestID.UUID)
		out.ExpectedGuestId = &id
	}
	if v.CheckedOutBy.Valid {
		id := openapi_types.UUID(v.CheckedOutBy.UUID)
		out.CheckedOutBy = &id
	}
	return out
}

func toAPIVisits(rows []domain.Visit) []api.Visit {
	out := make([]api.Visit, len(rows))
	for i, v := range rows {
		out[i] = toAPIVisit(v)
	}
	return out
}

func toAPIBoard(entries []domain.BoardEntry) []api.BoardEntry {
	out := make([]api.BoardEntry, len(entries))
	for i, e := range entries {
		out[i] = api.BoardEntry{Visit: toAPIVisit(e.Visit), Overdue: e.Overdue}
	}
	return out
}

func toAPIIncident(in domain.Incident) api.Incident {
	out := api.Incident{
		Id: in.ID, OccurredAt: in.OccurredAt, Severity: api.IncidentSeverity(in.Severity), Description: in.Description,
		PersonsInvolved: in.PersonsInvolved, ActionTaken: in.ActionTaken, ReportedBy: in.ReportedBy,
		IsClosed: in.IsClosed, ClosedAt: in.ClosedAt, CreatedAt: in.CreatedAt,
	}
	if in.ClosedBy.Valid {
		id := openapi_types.UUID(in.ClosedBy.UUID)
		out.ClosedBy = &id
	}
	return out
}

func toAPIIncidents(rows []domain.Incident) []api.Incident {
	out := make([]api.Incident, len(rows))
	for i, in := range rows {
		out[i] = toAPIIncident(in)
	}
	return out
}

func toAPIRecap(r service.Recap) api.VisitorRecap {
	bySeverity := make(map[string]int, len(r.Incidents))
	for sev, count := range r.Incidents {
		bySeverity[string(sev)] = count
	}
	return api.VisitorRecap{
		From: openapi_types.Date{Time: r.From}, To: openapi_types.Date{Time: r.To.AddDate(0, 0, -1)},
		TotalVisits: r.TotalVisits, StillOnCampus: r.StillOnCampus, AvgStayMinutes: float32(r.AvgStayMinutes),
		IncidentsBySeverity: bySeverity,
	}
}
