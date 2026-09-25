package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// firstValidTime returns the first valid time among candidates, in order,
// or ok=false if none are valid -- used to pick the latest-known approval
// timestamp among a chain of nullable stage-approval columns, newest stage
// first.
func firstValidTime(candidates ...sql.NullTime) (time.Time, bool) {
	for _, c := range candidates {
		if c.Valid {
			return c.Time, true
		}
	}
	return time.Time{}, false
}

// nullTimeArg converts a sql.NullTime to a pgx query argument: the time
// itself when valid, or nil (SQL NULL) otherwise.
func nullTimeArg(v sql.NullTime) any {
	if !v.Valid {
		return nil
	}
	return v.Time
}

// ensureWorkflowDefinition mirrors
// internal/modules/permits/service.EnsureDefaultDefinitions: it returns the
// tenant's active workflow_definitions row for kind, creating version 1 from
// permitsdomain.DefaultStages if none exists yet. A freshly onboarded
// tenant only gets one lazily, the first time the app itself needs it; the
// ETL needs it now, since workflow_instances.definition_id is not null.
func (st *Store) ensureWorkflowDefinition(ctx context.Context, tenantID uuid.UUID, kind permitsdomain.Kind) (uuid.UUID, error) {
	q := db.New(st.tx)
	if def, err := q.GetActiveWorkflowDefinition(ctx, db.GetActiveWorkflowDefinitionParams{TenantID: tenantID, Kind: string(kind)}); err == nil {
		return def.ID, nil
	} else if !notFound(err) {
		return uuid.Nil, fmt.Errorf("lookup workflow definition %s: %w", kind, err)
	}

	stages, err := json.Marshal(permitsdomain.DefaultStages(kind))
	if err != nil {
		return uuid.Nil, fmt.Errorf("encode default stages for %s: %w", kind, err)
	}
	var id uuid.UUID
	err = st.withRowSavepoint(ctx, func() error {
		created, err := q.CreateWorkflowDefinition(ctx, db.CreateWorkflowDefinitionParams{
			TenantID: tenantID, Kind: string(kind), Version: 1, IsActive: true, Stages: stages, Config: []byte("{}"),
		})
		if err != nil {
			return err
		}
		id = created.ID
		return nil
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("create default workflow definition %s: %w", kind, err)
	}
	return id, nil
}

// firstPeriod returns the periods map's entry with the lowest sequence, the
// default migrateExitPermits falls back to when the source did not record a
// start/end period.
func firstPeriod(periods map[int64]periodMigrationResult) (periodMigrationResult, bool) {
	var best periodMigrationResult
	found := false
	for _, p := range periods {
		if !found || p.sequence < best.sequence {
			best, found = p, true
		}
	}
	return best, found
}

// migrateExitPermits migrates final-state student_permits rows (see
// SionExitPermit's doc comment for which statuses count as final) to
// workflow_instances (kind exit_permit) plus their exit_permits detail row.
// Idempotency key: (tenant_id, subject_user_id, opened_at's date, kind) via
// select-then-insert, since a student_permits row has no other stable
// natural key on the target side.
func (st *Store) migrateExitPermits(
	ctx context.Context, tenantID, academicYearID uuid.UUID, permits []SionExitPermit,
	users map[int64]userMigrationResult, userNames map[int64]string, classes map[int64]classMigrationResult,
	periods map[int64]periodMigrationResult, loc *time.Location, stat *TableStat,
) error {
	definitionID, err := st.ensureWorkflowDefinition(ctx, tenantID, permitsdomain.KindExitPermit)
	if err != nil {
		return err
	}
	fallbackPeriod, hasFallbackPeriod := firstPeriod(periods)
	defaultedPeriods := 0

	for _, p := range permits {
		stat.Read++
		student, ok := users[p.StudentID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), "student not migrated (see identity table failures)")
			continue
		}
		var classID uuid.NullUUID
		className := "-"
		if p.ClassID.Valid {
			if class, ok := classes[p.ClassID.Int64]; ok {
				classID = uuid.NullUUID{UUID: class.targetClassID, Valid: true}
				className = mapping.CleanName(p.ClassName.String)
			}
		}

		startPeriod, endPeriod, ok := resolveExitPeriods(p, periods, fallbackPeriod, hasFallbackPeriod)
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), "period not migrated and no fallback period available (see periods table failures)")
			continue
		}
		if !p.StartPeriodID.Valid || !p.EndPeriodID.Valid {
			defaultedPeriods++
		}

		status := "expired"
		if p.Status == "completed" {
			status = "completed"
		}
		issuedAtTime, hasIssuedAt := firstValidTime(p.WakaApprovedAt, p.BKApprovedAt, p.TeacherApprovedAt, p.PicketApprovedAt)
		closedAt, hasClosedAt := firstValidTime(p.SecurityInAt, p.SecurityOutAt)
		switch {
		case hasClosedAt:
			closedAt = mapping.LocalToUTC(closedAt, loc)
		case hasIssuedAt:
			closedAt = mapping.LocalToUTC(issuedAtTime, loc)
		default:
			closedAt = mapping.LocalToUTC(p.UpdatedAt, loc)
		}
		if hasIssuedAt {
			issuedAtTime = mapping.LocalToUTC(issuedAtTime, loc)
		}

		var securityUserID uuid.NullUUID
		if p.SecurityOutID.Valid {
			if security, ok := users[p.SecurityOutID.Int64]; ok {
				securityUserID = uuid.NullUUID{UUID: security.targetUserID, Valid: true}
			}
		}

		payload, err := json.Marshal(map[string]any{
			"is_quick": p.IsQuick, "is_internal": p.IsInternal, "return_required": p.ReturnRequired,
		})
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), fmt.Sprintf("encode payload: %v", err))
			continue
		}

		destination := mapping.Truncate(mapping.CleanName(p.Reason), 500)
		if destination == "" {
			destination = "(tidak ada keterangan)"
		}
		var exitedAt any
		if p.SecurityOutAt.Valid {
			exitedAt = mapping.LocalToUTC(p.SecurityOutAt.Time, loc)
		}
		issuedAtArg := nullTimeArg(sql.NullTime{Time: issuedAtTime, Valid: hasIssuedAt})
		openedAt := mapping.LocalToUTC(p.CreatedAt, loc)

		// Natural key: the source has no column this ETL stores that
		// identifies the row across runs, so a re-run is matched on
		// (subject, kind, opened_at) -- a source timestamp precise to the
		// second, which two different student_permits rows for the same
		// student cannot plausibly share.
		existingID, found, err := st.selectID(ctx,
			`select id from workflow_instances where tenant_id = $1 and subject_user_id = $2 and kind = 'exit_permit' and opened_at = $3`,
			tenantID, student.targetUserID, openedAt,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), fmt.Sprintf("lookup workflow instance: %v", err))
			continue
		}

		err = st.withRowSavepoint(ctx, func() error {
			instanceID := existingID
			if found {
				if _, err := st.tx.Exec(ctx,
					`update workflow_instances set status = $1, payload = $2, closed_at = $3, class_id = $4 where id = $5`,
					status, payload, closedAt, classID, instanceID,
				); err != nil {
					return fmt.Errorf("update workflow instance: %w", err)
				}
				if _, err := st.tx.Exec(ctx,
					`update exit_permits set destination = $1, start_period_id = $2, end_period_id = $3,
					   issued_at = $4, exited_at = $5, security_user_id = $6 where instance_id = $7`,
					destination, startPeriod.targetPeriodID, endPeriod.targetPeriodID, issuedAtArg, exitedAt, securityUserID, instanceID,
				); err != nil {
					return fmt.Errorf("update exit permit: %w", err)
				}
				return nil
			}

			if err := st.tx.QueryRow(ctx,
				`insert into workflow_instances (
				   tenant_id, academic_year_id, definition_id, kind, subject_user_id, class_id,
				   current_stage_index, status, payload, opened_at, local_date, closed_at, created_by
				 ) values ($1, $2, $3, 'exit_permit', $4, $5, 4, $6, $7, $8, $9, $10, $4)
				 returning id`,
				tenantID, academicYearID, definitionID, student.targetUserID, classID,
				status, payload, openedAt, mapping.LocalDate(p.CreatedAt), closedAt,
			).Scan(&instanceID); err != nil {
				return fmt.Errorf("create workflow instance: %w", err)
			}
			if _, err := st.tx.Exec(ctx,
				`insert into exit_permits (
				   instance_id, tenant_id, destination, start_period_id, end_period_id,
				   issued_at, exited_at, security_user_id, student_name_snapshot, class_name_snapshot
				 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
				instanceID, tenantID, destination, startPeriod.targetPeriodID, endPeriod.targetPeriodID,
				issuedAtArg, exitedAt, securityUserID,
				mapping.Truncate(userNames[p.StudentID], 150), mapping.Truncate(className, 100),
			); err != nil {
				return fmt.Errorf("create exit permit: %w", err)
			}
			return nil
		})
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), err.Error())
			continue
		}
		if found {
			stat.Updated++
		} else {
			stat.Created++
		}
	}
	if defaultedPeriods > 0 {
		stat.RecordGap(fmt.Sprintf("student_permits: %d row(s) had no start/end period recorded; defaulted to the tenant's first configured period", defaultedPeriods))
	}
	return nil
}

// resolveExitPeriods resolves an exit permit's start/end period, falling
// back to the tenant's first configured period when the source left either
// column null (about a quarter of this school's final-state rows).
func resolveExitPeriods(
	p SionExitPermit, periods map[int64]periodMigrationResult, fallback periodMigrationResult, hasFallback bool,
) (start, end periodMigrationResult, ok bool) {
	start, startOK := periodOrFallback(p.StartPeriodID, periods, fallback, hasFallback)
	end, endOK := periodOrFallback(p.EndPeriodID, periods, fallback, hasFallback)
	return start, end, startOK && endOK
}

func periodOrFallback(
	sourceID sql.NullInt64, periods map[int64]periodMigrationResult, fallback periodMigrationResult, hasFallback bool,
) (periodMigrationResult, bool) {
	if sourceID.Valid {
		if p, ok := periods[sourceID.Int64]; ok {
			return p, true
		}
		return periodMigrationResult{}, false
	}
	return fallback, hasFallback
}

// migrateLeaveRequests migrates final-state permits rows (see
// SionLeaveRequest's doc comment for which flag combinations count as
// final) to workflow_instances (kind leave_request) plus their
// leave_requests detail row.
func (st *Store) migrateLeaveRequests(
	ctx context.Context, tenantID, academicYearID uuid.UUID, requests []SionLeaveRequest,
	users map[int64]userMigrationResult, userNames map[int64]string, classes map[int64]classMigrationResult,
	loc *time.Location, stat *TableStat,
) error {
	definitionID, err := st.ensureWorkflowDefinition(ctx, tenantID, permitsdomain.KindLeaveRequest)
	if err != nil {
		return err
	}
	noApproverRecorded := 0

	for _, p := range requests {
		stat.Read++
		student, ok := users[p.StudentID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), "student not migrated (see identity table failures)")
			continue
		}
		var classID uuid.NullUUID
		className := "-"
		if p.ClassID.Valid {
			if class, ok := classes[p.ClassID.Int64]; ok {
				classID = uuid.NullUUID{UUID: class.targetClassID, Valid: true}
				className = mapping.CleanName(p.ClassName.String)
			}
		}

		category, reason := mapLeaveCategory(p.PermitName, p.OtherPermit.String)

		rejected := p.ClassAdmin.Valid && !p.ClassAdmin.Bool
		status := "completed"
		if rejected {
			status = "rejected"
		}
		noApproverRecorded++ // permits has no approver-user column at all, for every row

		payload, err := json.Marshal(map[string]any{"category": string(category), "starts_on": p.StartDate.Format("2006-01-02"), "ends_on": p.EndDate.Format("2006-01-02")})
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), fmt.Sprintf("encode payload: %v", err))
			continue
		}

		openedAt := mapping.LocalToUTC(p.CreatedAt, loc)
		closedAt := mapping.LocalToUTC(p.UpdatedAt, loc)
		var issuedAt pgtype.Timestamptz
		if status == "completed" {
			issuedAt = pgtype.Timestamptz{Time: closedAt, Valid: true}
		}

		// Same natural key as migrateExitPermits: (subject, kind,
		// opened_at), since permits carries no id this ETL stores on the
		// target row.
		existingID, found, err := st.selectID(ctx,
			`select id from workflow_instances where tenant_id = $1 and subject_user_id = $2 and kind = 'leave_request' and opened_at = $3`,
			tenantID, student.targetUserID, openedAt,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), fmt.Sprintf("lookup workflow instance: %v", err))
			continue
		}

		err = st.withRowSavepoint(ctx, func() error {
			instanceID := existingID
			if found {
				if _, err := st.tx.Exec(ctx,
					`update workflow_instances set status = $1, payload = $2, closed_at = $3, class_id = $4 where id = $5`,
					status, payload, closedAt, classID, instanceID,
				); err != nil {
					return fmt.Errorf("update workflow instance: %w", err)
				}
				if _, err := st.tx.Exec(ctx,
					`update leave_requests set category = $1, reason = $2, starts_on = $3, ends_on = $4, issued_at = $5 where instance_id = $6`,
					string(category), reason, p.StartDate, p.EndDate, issuedAt, instanceID,
				); err != nil {
					return fmt.Errorf("update leave request: %w", err)
				}
				return nil
			}

			if err := st.tx.QueryRow(ctx,
				`insert into workflow_instances (
				   tenant_id, academic_year_id, definition_id, kind, subject_user_id, class_id,
				   current_stage_index, status, payload, opened_at, local_date, closed_at, created_by
				 ) values ($1, $2, $3, 'leave_request', $4, $5, 2, $6, $7, $8, $9, $10, $4)
				 returning id`,
				tenantID, academicYearID, definitionID, student.targetUserID, classID,
				status, payload, openedAt, mapping.LocalDate(p.CreatedAt), closedAt,
			).Scan(&instanceID); err != nil {
				return fmt.Errorf("create workflow instance: %w", err)
			}
			if _, err := st.tx.Exec(ctx,
				`insert into leave_requests (
				   instance_id, tenant_id, category, reason, starts_on, ends_on,
				   issued_at, student_name_snapshot, class_name_snapshot
				 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				instanceID, tenantID, string(category), reason, p.StartDate, p.EndDate,
				issuedAt, mapping.Truncate(userNames[p.StudentID], 150), mapping.Truncate(className, 100),
			); err != nil {
				return fmt.Errorf("create leave request: %w", err)
			}
			return nil
		})
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), err.Error())
			continue
		}
		if found {
			stat.Updated++
		} else {
			stat.Created++
		}
	}
	if noApproverRecorded > 0 {
		stat.RecordGap(fmt.Sprintf("permits: %d row(s) migrated with no approver recorded -- the source only keeps a boolean approval flag per stage, not who approved; leave_requests.issued_by left null", noApproverRecorded))
	}
	return nil
}

// mapLeaveCategory maps a live-schema permits.permit_name to the target's
// leave_requests.category enum. "Urusan Keluarga" (family matters) has no
// matching category -- it is not dispensation (a specific excused-absence
// type for official duties) -- so it defaults to 'other' with its own label
// kept as the free-text reason, the same treatment "Lainnya" already gets.
func mapLeaveCategory(permitName, otherPermit string) (category permitsdomain.Category, reason string) {
	switch permitName {
	case "Upacara Agama":
		return permitsdomain.CategoryReligiousCeremony, "Upacara agama"
	case "Sakit":
		return permitsdomain.CategorySick, "Sakit"
	case "Urusan Keluarga":
		return permitsdomain.CategoryOther, "Urusan Keluarga"
	default: // "Lainnya"
		reason = mapping.CleanName(otherPermit)
		if reason == "" {
			reason = "Lainnya"
		}
		return permitsdomain.CategoryOther, mapping.Truncate(reason, 1000)
	}
}
