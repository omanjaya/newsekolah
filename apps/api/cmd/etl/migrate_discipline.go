package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// migrateViolationTypes keys on (tenant, code), where code is derived from
// the violation name (mapping.SlugCode) since SION identifies violation
// types by name only.
func (st *Store) migrateViolationTypes(ctx context.Context, tenantID uuid.UUID, types []SionViolationType, stat *TableStat) map[string]uuid.UUID {
	result := make(map[string]uuid.UUID, len(types))
	for _, v := range types {
		stat.Read++
		code := mapping.SlugCode(v.Name, 32)
		id, created, err := st.upsertOne(ctx,
			`insert into violation_types (tenant_id, code, name, points)
			 values ($1, $2, $3, $4)
			 on conflict (tenant_id, code) do update set name = excluded.name, points = excluded.points
			 returning id, (xmax = 0)`,
			tenantID, code, mapping.CleanName(v.Name), v.Points,
		)
		if err != nil {
			stat.RecordFailure(v.ID, fmt.Sprintf("upsert violation type: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[v.ID] = id
	}
	return result
}

// migrateViolationRecords has no natural key of its own in either schema
// (SION's id is an opaque generated string); it keys on the tuple
// (student, violation_type, occurred_on, reporter), which is as close to a
// natural key as a disciplinary incident has.
func (st *Store) migrateViolationRecords(
	ctx context.Context, tenantID, academicYearID uuid.UUID, records []SionViolationRecord,
	users map[string]userMigrationResult, violationTypes map[string]uuid.UUID, stat *TableStat,
) {
	for _, r := range records {
		stat.Read++
		student, ok := users[r.StudentUserID]
		if !ok {
			stat.RecordFailure(r.ID, "student not migrated (see identity table failures)")
			continue
		}
		reporter, ok := users[r.ReporterUserID]
		if !ok {
			stat.RecordFailure(r.ID, "reporter not migrated (see identity table failures)")
			continue
		}
		violationTypeID, ok := violationTypes[r.ViolationID]
		if !ok {
			stat.RecordFailure(r.ID, "violation type not migrated (see violation_types table failures)")
			continue
		}
		occurredOn := mapping.LocalDate(r.OccurredDate)

		_, found, err := st.selectID(ctx,
			`select id from violation_records
			 where academic_year_id = $1 and student_user_id = $2 and violation_type_id = $3 and occurred_on = $4 and reporter_user_id = $5`,
			academicYearID, student.targetUserID, violationTypeID, occurredOn, reporter.targetUserID,
		)
		if err != nil {
			stat.RecordFailure(r.ID, fmt.Sprintf("lookup violation record: %v", err))
			continue
		}
		if found {
			stat.Skipped++
			continue
		}

		if err := st.execRow(ctx,
			`insert into violation_records (
			   tenant_id, academic_year_id, student_user_id, violation_type_id, points_snapshot, occurred_on, reporter_user_id
			 )
			 select $1, $2, $3, $4, points, $5, $6 from violation_types where id = $4`,
			tenantID, academicYearID, student.targetUserID, violationTypeID, occurredOn, reporter.targetUserID,
		); err != nil {
			stat.RecordFailure(r.ID, fmt.Sprintf("create violation record: %v", err))
			continue
		}
		stat.Created++
	}
}

// migrateWarningLetters keys on the target's own `unique (tenant_id,
// academic_year_id, letter_number)`, identical to SION's own
// `uq_warning_letter_number`.
func (st *Store) migrateWarningLetters(
	ctx context.Context, tenantID, academicYearID uuid.UUID, letters []SionWarningLetter,
	users map[string]userMigrationResult, stat *TableStat,
) {
	for _, w := range letters {
		stat.Read++
		student, ok := users[w.StudentUserID]
		if !ok {
			stat.RecordFailure(w.ID, "student not migrated (see identity table failures)")
			continue
		}
		level, ok := mapSPLevel(w.SPLevel)
		if !ok {
			stat.RecordFailure(w.ID, fmt.Sprintf("unrecognised warning level %q", w.SPLevel))
			continue
		}
		var issuedBy any
		if w.IssuedByUserID != "" {
			if issuer, ok := users[w.IssuedByUserID]; ok {
				issuedBy = issuer.targetUserID
			}
		}

		// SION has no stored "threshold_points" for a warning letter, only
		// the total_points that triggered it (the threshold itself lives in
		// per-tenant violation_sp_settings, out of scope for this ETL); the
		// total is reused as an approximation and the gap is reported once
		// per run in migratePermits.
		_, created, err := st.upsertOne(ctx,
			`insert into warning_letters (
			   tenant_id, academic_year_id, student_user_id, level, level_label, threshold_points, total_points,
			   letter_number, issued_by, issued_at
			 ) values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)
			 on conflict (tenant_id, academic_year_id, letter_number) do update set total_points = excluded.total_points
			 returning id, (xmax = 0)`,
			tenantID, academicYearID, student.targetUserID, level, w.SPLevel, w.TotalPoints,
			w.LetterNumber, issuedBy, w.IssuedAt,
		)
		if err != nil {
			stat.RecordFailure(w.ID, fmt.Sprintf("upsert warning letter: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
	}
}

func mapSPLevel(spLevel string) (int, bool) {
	switch spLevel {
	case "SP 1":
		return 1, true
	case "SP 2":
		return 2, true
	case "SP 3":
		return 3, true
	default:
		return 0, false
	}
}
