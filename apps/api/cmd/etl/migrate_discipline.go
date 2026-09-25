package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// violationNoteMaxLen matches violation_records' own
// `check (length(notes) <= 1000)`.
const violationNoteMaxLen = 1000

// migrateViolationTypes migrates violations to violation_types, keyed on
// the target's own (tenant_id, code) unique constraint; the source's own
// violation_code is already a short, stable code, reused as-is.
// violation_types.category has no source column, so every row defaults to
// the schema's own default, 'general'.
func (st *Store) migrateViolationTypes(ctx context.Context, tenantID uuid.UUID, types []SionViolationType, stat *TableStat) (IDMap, error) {
	result := make(IDMap, len(types))
	for _, v := range types {
		stat.Read++
		id, created, err := st.upsertOne(ctx,
			`insert into violation_types (tenant_id, code, name, points, is_active)
			 values ($1, $2, $3, $4, $5)
			 on conflict (tenant_id, code) do update set
			   name = excluded.name, points = excluded.points, is_active = excluded.is_active
			 returning id, (xmax = 0)`,
			tenantID, v.Code, mapping.CleanName(v.Name), v.Points, v.IsActive,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), fmt.Sprintf("upsert violation type: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[v.ID] = id
	}
	return result, nil
}

// migrateViolationRecords migrates student_has_violations to
// violation_records. The target table has no unique constraint of its own
// (a student can rack up the same violation type more than once), so this
// keys idempotency on (academic_year_id, student_user_id, violation_type_id,
// occurred_on): a re-run updates the existing row for that day instead of
// duplicating it, at the cost of collapsing a genuine same-day repeat of the
// same violation type into one row -- rare in this school's data (4 such
// groups) and reported as a gap rather than silently doubled on every run.
// mappings from the legacy MySQL schema to the new Postgres schema; each
// branch handles one nullable source column or one gap case, and is a
// one-time migration tool exercised by its own tests, not runtime API
// logic. Splitting it would only relocate the same linear mapping.
//
//nolint:gocyclo // ETL migration: a fixed, ordered sequence of per-row/per-column field
func (st *Store) migrateViolationRecords(
	ctx context.Context, tenantID, academicYearID uuid.UUID, records []SionViolationRecord,
	users map[int64]userMigrationResult, violationTypes IDMap, stat *TableStat,
) error {
	seenKeys := make(map[string]bool)
	collapsed := 0
	for _, v := range records {
		stat.Read++
		student, ok := users[v.StudentID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), "student not migrated (see identity table failures)")
			continue
		}
		violationTypeID, ok := violationTypes[v.ViolationID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), "violation type not migrated (see violation_types table failures)")
			continue
		}
		if !v.ReporterID.Valid {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), "no reporter recorded in source")
			continue
		}
		reporter, ok := users[v.ReporterID.Int64]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), "reporter not migrated (see identity table failures)")
			continue
		}
		if !v.CreatedAt.Valid {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), "no date recorded in source")
			continue
		}

		occurredOn := mapping.LocalDate(v.CreatedAt.Time)
		key := fmt.Sprintf("%s|%s|%s", student.targetUserID, violationTypeID, occurredOn.Format("2006-01-02"))
		if seenKeys[key] {
			collapsed++
		}
		seenKeys[key] = true

		notes := mapping.CleanName(v.ExtraNote.String)
		if v.IsSentHome {
			if notes != "" {
				notes += " "
			}
			notes += "(siswa dipulangkan)"
		}
		notes = mapping.Truncate(notes, violationNoteMaxLen)

		var pointsSnapshot int
		if err := st.tx.QueryRow(ctx, `select points from violation_types where id = $1`, violationTypeID).Scan(&pointsSnapshot); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), fmt.Sprintf("lookup violation type points: %v", err))
			continue
		}

		existingID, found, err := st.selectID(ctx,
			`select id from violation_records
			 where academic_year_id = $1 and student_user_id = $2 and violation_type_id = $3 and occurred_on = $4`,
			academicYearID, student.targetUserID, violationTypeID, occurredOn,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), fmt.Sprintf("lookup violation record: %v", err))
			continue
		}
		if found {
			if err := st.execRow(ctx,
				`update violation_records set points_snapshot = $1, reporter_user_id = $2, notes = $3 where id = $4`,
				pointsSnapshot, reporter.targetUserID, notes, existingID,
			); err != nil {
				stat.RecordFailure(fmt.Sprintf("%d", v.ID), fmt.Sprintf("update violation record: %v", err))
				continue
			}
			stat.Updated++
			continue
		}

		if err := st.execRow(ctx,
			`insert into violation_records (
			   tenant_id, academic_year_id, student_user_id, violation_type_id, points_snapshot,
			   occurred_on, reporter_user_id, notes
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
			tenantID, academicYearID, student.targetUserID, violationTypeID, pointsSnapshot,
			occurredOn, reporter.targetUserID, notes,
		); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), fmt.Sprintf("create violation record: %v", err))
			continue
		}
		stat.Created++
	}
	if collapsed > 0 {
		stat.RecordGap(fmt.Sprintf(
			"student_has_violations: %d row(s) shared the same (student, violation type, day) as another row and collapsed into it -- violation_records has no column to distinguish an exact same-day repeat",
			collapsed,
		))
	}
	return nil
}

// recordSuspensionGap notes suspensions, which is not migrated: the target
// schema tracks discipline through violation_records (points) and
// warning_letters (thresholds), with no separate in-school/out-of-school
// suspension entity to carry duration_days/start_date/end_date into. stat is
// its own report table ("suspensions") so the read count is visible even
// though nothing is ever created from it.
func recordSuspensionGap(count int, stat *TableStat) {
	stat.Read = count
	if count > 0 {
		stat.RecordGap("not migrated -- the target schema has no suspension entity separate from violation_records/warning_letters")
	}
}
