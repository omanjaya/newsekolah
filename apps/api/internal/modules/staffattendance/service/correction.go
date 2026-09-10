package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

// CorrectRecord is the only path that can overwrite or clear an existing
// record's timestamps outright (upsertFromSource only ever fills in a
// missing field, never clears one): every call requires a reason, and the
// before/after snapshot is kept forever in staff_attendance_corrections,
// per this module's "every correction keeps who changed it and why"
// requirement.
func (s *Service) CorrectRecord(ctx context.Context, tenantID, recordID, actorID uuid.UUID, in CorrectionInput) (RecordView, error) {
	if strings.TrimSpace(in.Reason) == "" {
		return RecordView{}, domain.ErrCorrectionReasonRequired
	}

	var out RecordView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		existing, found, err := s.repo.GetRecord(ctx, tenantID, recordID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrRecordNotFound
		}
		previous := existing.ToSnapshot()

		arrival, departure := existing.ArrivalAt, existing.DepartureAt
		switch {
		case in.ClearArrival:
			arrival = nil
		case in.ArrivalAt != nil:
			arrival = in.ArrivalAt
		}
		switch {
		case in.ClearDeparture:
			departure = nil
		case in.DepartureAt != nil:
			departure = in.DepartureAt
		}
		notes := existing.Notes
		if in.Notes != nil {
			notes = *in.Notes
		}

		result, err := s.computeStatus(ctx, tenantID, existing.EmployeeUserID, existing.Date, arrival, departure)
		if err != nil {
			return err
		}

		updated := existing
		updated.ArrivalAt, updated.DepartureAt = arrival, departure
		updated.StatusCode, updated.LateMinutes, updated.EarlyLeaveMinutes = result.StatusCode, result.LateMinutes, result.EarlyLeaveMinutes
		updated.Notes = notes
		updated.UpdatedBy = uuid.NullUUID{UUID: actorID, Valid: true}

		saved, err := s.repo.ReplaceRecordFields(ctx, tenantID, updated)
		if err != nil {
			return err
		}
		if err := s.repo.CreateCorrection(ctx, tenantID, recordID, actorID, in.Reason, previous, saved.ToSnapshot()); err != nil {
			return err
		}
		name, err := s.repo.GetEmployeeName(ctx, tenantID, saved.EmployeeUserID)
		if err != nil {
			return err
		}
		out = toRecordView(saved, name)
		return nil
	})
	return out, err
}
