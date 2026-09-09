package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// migratePermits migrates SION's issued (letter-bearing) student leave
// requests into the target's workflow-engine-backed leave_requests table.
// Exit permits and late arrivals are not migrated at all: see
// docs/13-etl-sion.md for why (they are single-day operational records with
// no letter, and exit permits in particular are governed by an exclusion
// constraint and gate-token lifecycle that a historical replay would fight
// rather than respect). Their counts are still read so the report states
// the size of that gap precisely instead of leaving it a vague footnote.
func (st *Store) migratePermits(
	ctx context.Context, tenantID, academicYearID uuid.UUID, source *Source, sionAcademicYearID string,
	requests []SionLeaveRequest, users map[string]userMigrationResult, classes map[string]classMigrationResult,
	stat *TableStat,
) {
	definitionID, err := st.ensureImportWorkflowDefinition(ctx, tenantID)
	if err != nil {
		stat.RecordFailure("*", fmt.Sprintf("ensure leave_request workflow definition: %v", err))
		return
	}

	for _, r := range requests {
		stat.Read++
		student, ok := users[r.StudentUserID]
		if !ok {
			stat.RecordFailure(r.ID, "student not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[r.ClassID]
		if !ok {
			stat.RecordFailure(r.ID, "class not migrated (see classes table failures)")
			continue
		}
		if !r.LetterNumber.Valid || r.LetterNumber.String == "" {
			stat.RecordFailure(r.ID, "issued leave request has no letter_number")
			continue
		}

		_, found, err := st.selectID(ctx,
			`select instance_id from leave_requests where tenant_id = $1 and letter_number = $2`,
			tenantID, r.LetterNumber.String,
		)
		if err != nil {
			stat.RecordFailure(r.ID, fmt.Sprintf("lookup leave request: %v", err))
			continue
		}
		if found {
			stat.Skipped++
			continue
		}

		var issuedBy any
		if r.IssuedByUserID.Valid {
			if issuer, ok := users[r.IssuedByUserID.String]; ok {
				issuedBy = issuer.targetUserID
			}
		}

		instanceID := uuid.New()
		if err := st.execRow(ctx,
			`insert into workflow_instances (
			   id, tenant_id, academic_year_id, definition_id, kind, subject_user_id, class_id,
			   current_stage_index, status, opened_at, closed_at, created_by
			 ) values ($1, $2, $3, $4, 'leave_request', $5, $6, 0, 'completed', $7, $7, $8)`,
			instanceID, tenantID, academicYearID, definitionID, student.targetUserID, class.targetClassID,
			r.IssuedAt, issuedBy,
		); err != nil {
			stat.RecordFailure(r.ID, fmt.Sprintf("create workflow instance: %v", err))
			continue
		}

		if err := st.execRow(ctx,
			`insert into leave_requests (
			   instance_id, tenant_id, category, reason, starts_on, ends_on, letter_number, issued_at, issued_by,
			   student_name_snapshot, class_name_snapshot, guardian_name_snapshot
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
			instanceID, tenantID, mapLeaveCategory(r.Category), r.Reason, mapping.LocalDate(r.StartDate), mapping.LocalDate(r.EndDate),
			r.LetterNumber.String, r.IssuedAt, issuedBy,
			mapping.CleanName(r.StudentNameSnapshot), mapping.CleanName(r.ClassNameSnapshot), nullText(r.GuardianNameSnapshot),
		); err != nil {
			stat.RecordFailure(r.ID, fmt.Sprintf("create leave request: %v", err))
			continue
		}
		stat.Created++
	}

	recordSkippedPermitCounts(source, sionAcademicYearID, stat)
}

func mapLeaveCategory(sionCategory string) string {
	switch sionCategory {
	case "religious_ceremony", "sick", "dispensation":
		return sionCategory
	default:
		return "other"
	}
}

// ensureImportWorkflowDefinition reuses the tenant's active leave_request
// workflow definition if it has one (created by onboarding), or creates a
// minimal single-stage definition for historical imports. It never creates
// a second active definition: `ux_workflow_definitions_active` allows only
// one per (tenant, kind).
func (st *Store) ensureImportWorkflowDefinition(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	id, found, err := st.selectID(ctx,
		`select id from workflow_definitions where tenant_id = $1 and kind = 'leave_request' and is_active`,
		tenantID,
	)
	if err != nil {
		return uuid.Nil, err
	}
	if found {
		return id, nil
	}
	var newID uuid.UUID
	err = st.withRowSavepoint(ctx, func() error {
		return st.tx.QueryRow(ctx,
			`insert into workflow_definitions (tenant_id, kind, version, is_active, stages, config)
			 values ($1, 'leave_request', 1, true,
			   '[{"key":"imported","label":"Imported from SION","approver_rule":"any_admin","verification":"manual"}]'::jsonb,
			   '{}'::jsonb)
			 returning id`,
			tenantID,
		).Scan(&newID)
	})
	return newID, err
}

// recordSkippedPermitCounts adds gap notes for the SION tables this ETL
// deliberately does not migrate, sized by an actual count rather than a
// guess.
func recordSkippedPermitCounts(source *Source, sionAcademicYearID string, stat *TableStat) {
	if n, err := source.CountExitPermits(sionAcademicYearID); err == nil && n > 0 {
		stat.RecordGap(fmt.Sprintf("%d exit permit(s) in SION were not migrated (operational gate passes, not historical letters)", n))
	}
	if n, err := source.CountLateArrivals(sionAcademicYearID); err == nil && n > 0 {
		stat.RecordGap(fmt.Sprintf("%d late arrival record(s) in SION were not migrated (same-day disciplinary workflow, no letter)", n))
	}
	if n, err := source.CountPendingLeaveRequests(sionAcademicYearID); err == nil && n > 0 {
		stat.RecordGap(fmt.Sprintf("%d leave request(s) in SION are still in-flight (not issued or rejected) and were not migrated", n))
	}
}
