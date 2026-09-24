// Package repository is the sqlc-backed implementation of the grading
// service's data boundary.
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func isUnique(err error) bool {
	var pgErr interface{ SQLState() string }
	return errors.As(err, &pgErr) && pgErr.SQLState() == "23505"
}

// Components and grades.

func (r *Repository) ListComponents(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) ([]domain.Component, error) {
	rows, err := r.queries(ctx).ListComponents(ctx, db.ListComponentsParams{TenantID: tenantID, TermID: termID, ClassID: classID, SubjectID: subjectID})
	if err != nil {
		return nil, fmt.Errorf("list components: %w", err)
	}
	out := make([]domain.Component, len(rows))
	for i, row := range rows {
		out[i] = toComponent(row)
	}
	return out, nil
}

func (r *Repository) GetComponent(ctx context.Context, tenantID, id uuid.UUID) (domain.Component, bool, error) {
	row, err := r.queries(ctx).GetComponent(ctx, db.GetComponentParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Component{}, false, nil
	}
	if err != nil {
		return domain.Component{}, false, fmt.Errorf("get component: %w", err)
	}
	return toComponent(row), true, nil
}

func (r *Repository) CreateComponent(ctx context.Context, c domain.Component) (domain.Component, error) {
	row, err := r.queries(ctx).CreateComponent(ctx, db.CreateComponentParams{
		TenantID: c.TenantID, AcademicYearID: c.AcademicYearID, TermID: c.TermID, TeacherUserID: c.TeacherUserID,
		ClassID: c.ClassID, SubjectID: c.SubjectID, Code: c.Code, Kind: string(c.Kind), Description: c.Description,
		Kktp: pdatabase.NumericPtr(c.KKTP), Weight: pdatabase.Numeric(c.Weight), Sequence: int16(c.Sequence), //nolint:gosec // small
	})
	if isUnique(err) {
		return domain.Component{}, domain.ErrComponentCodeExists
	}
	if err != nil {
		return domain.Component{}, fmt.Errorf("create component: %w", err)
	}
	return toComponent(row), nil
}

func (r *Repository) UpdateComponent(ctx context.Context, c domain.Component) (domain.Component, error) {
	row, err := r.queries(ctx).UpdateComponent(ctx, db.UpdateComponentParams{
		TenantID: c.TenantID, ID: c.ID, Code: c.Code, Kind: string(c.Kind), Description: c.Description,
		Kktp: pdatabase.NumericPtr(c.KKTP), Weight: pdatabase.Numeric(c.Weight), Sequence: int16(c.Sequence), //nolint:gosec // small
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Component{}, domain.ErrComponentNotFound
	}
	if isUnique(err) {
		return domain.Component{}, domain.ErrComponentCodeExists
	}
	if err != nil {
		return domain.Component{}, fmt.Errorf("update component: %w", err)
	}
	return toComponent(row), nil
}

func (r *Repository) DeleteComponent(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteComponent(ctx, db.DeleteComponentParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete component: %w", err)
	}
	return nil
}

func (r *Repository) ComponentHasGrades(ctx context.Context, tenantID, componentID uuid.UUID) (bool, error) {
	has, err := r.queries(ctx).ComponentHasGrades(ctx, db.ComponentHasGradesParams{TenantID: tenantID, ComponentID: componentID})
	if err != nil {
		return false, fmt.Errorf("component has grades: %w", err)
	}
	return has, nil
}

func (r *Repository) UpsertGrade(ctx context.Context, tenantID, componentID, studentID uuid.UUID, score float64, recordedBy uuid.UUID) (domain.Grade, error) {
	row, err := r.queries(ctx).UpsertGrade(ctx, db.UpsertGradeParams{
		TenantID: tenantID, ComponentID: componentID, StudentUserID: studentID,
		Score: pdatabase.Numeric(score), RecordedBy: pgtype.UUID{Bytes: recordedBy, Valid: true},
	})
	if err != nil {
		return domain.Grade{}, fmt.Errorf("upsert grade: %w", err)
	}
	return domain.Grade{ComponentID: row.ComponentID, StudentUserID: row.StudentUserID, Score: pdatabase.FloatOrZero(row.Score), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt)}, nil
}

func (r *Repository) DeleteGrade(ctx context.Context, tenantID, componentID, studentID uuid.UUID) error {
	if err := r.queries(ctx).DeleteGrade(ctx, db.DeleteGradeParams{TenantID: tenantID, ComponentID: componentID, StudentUserID: studentID}); err != nil {
		return fmt.Errorf("delete grade: %w", err)
	}
	return nil
}

func (r *Repository) ListGradesForComponents(ctx context.Context, tenantID uuid.UUID, componentIDs []uuid.UUID) ([]domain.Grade, error) {
	if len(componentIDs) == 0 {
		return nil, nil
	}
	rows, err := r.queries(ctx).ListGradesForComponents(ctx, db.ListGradesForComponentsParams{TenantID: tenantID, ComponentIds: componentIDs})
	if err != nil {
		return nil, fmt.Errorf("list grades: %w", err)
	}
	out := make([]domain.Grade, len(rows))
	for i, row := range rows {
		out[i] = domain.Grade{ComponentID: row.ComponentID, StudentUserID: row.StudentUserID, Score: pdatabase.FloatOrZero(row.Score), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt)}
	}
	return out, nil
}

func (r *Repository) ListGradesForStudent(ctx context.Context, tenantID, studentID, termID uuid.UUID) ([]service.StudentGradeRow, error) {
	rows, err := r.queries(ctx).ListGradesForStudent(ctx, db.ListGradesForStudentParams{TenantID: tenantID, StudentUserID: studentID, TermID: termID})
	if err != nil {
		return nil, fmt.Errorf("list student grades: %w", err)
	}
	out := make([]service.StudentGradeRow, len(rows))
	for i, row := range rows {
		out[i] = service.StudentGradeRow{
			ComponentID: row.ComponentID, Code: row.Code, Kind: domain.ComponentKind(row.Kind), Weight: pdatabase.FloatOrZero(row.Weight),
			KKTP: pdatabase.FloatPtr(row.Kktp), SubjectID: row.SubjectID, ClassID: row.ClassID, TermID: row.TermID,
			Score: pdatabase.FloatOrZero(row.Score), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
		}
	}
	return out, nil
}

// Publication.

func (r *Repository) SetPublication(ctx context.Context, tenantID, yearID, termID, classID, subjectID uuid.UUID, published bool, actorID uuid.UUID) (service.Publication, error) {
	row, err := r.queries(ctx).UpsertPublication(ctx, db.UpsertPublicationParams{
		TenantID: tenantID, AcademicYearID: yearID, TermID: termID, ClassID: classID, SubjectID: subjectID,
		IsPublished: published, PublishedBy: pgtype.UUID{Bytes: actorID, Valid: true},
	})
	if err != nil {
		return service.Publication{}, fmt.Errorf("set publication: %w", err)
	}
	return toPublication(row), nil
}

func (r *Repository) GetPublication(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) (service.Publication, bool, error) {
	row, err := r.queries(ctx).GetPublication(ctx, db.GetPublicationParams{TenantID: tenantID, TermID: termID, ClassID: classID, SubjectID: subjectID})
	if errors.Is(err, pgx.ErrNoRows) {
		return service.Publication{TermID: termID, ClassID: classID, SubjectID: subjectID}, false, nil
	}
	if err != nil {
		return service.Publication{}, false, fmt.Errorf("get publication: %w", err)
	}
	return toPublication(row), true, nil
}

func (r *Repository) ListPublishedSubjects(ctx context.Context, tenantID, termID, classID uuid.UUID) ([]uuid.UUID, error) {
	ids, err := r.queries(ctx).ListPublishedSubjectsForClass(ctx, db.ListPublishedSubjectsForClassParams{TenantID: tenantID, TermID: termID, ClassID: classID})
	if err != nil {
		return nil, fmt.Errorf("list published subjects: %w", err)
	}
	return ids, nil
}

// Report scores.

func (r *Repository) UpsertReportScore(ctx context.Context, tenantID, yearID, termID, classID, subjectID, studentID uuid.UUID, previous, manual *float64, automatic float64) (service.ReportScore, error) {
	row, err := r.queries(ctx).UpsertReportScore(ctx, db.UpsertReportScoreParams{
		TenantID: tenantID, AcademicYearID: yearID, TermID: termID, ClassID: classID, SubjectID: subjectID, StudentUserID: studentID,
		PreviousScore: pdatabase.NumericPtr(previous), ManualScore: pdatabase.NumericPtr(manual), AutomaticScore: pdatabase.Numeric(automatic),
	})
	if err != nil {
		return service.ReportScore{}, fmt.Errorf("upsert report score: %w", err)
	}
	return toReportScore(row), nil
}

func (r *Repository) SetManualReportScore(ctx context.Context, tenantID, yearID, termID, classID, subjectID, studentID uuid.UUID, manual *float64) (service.ReportScore, error) {
	row, err := r.queries(ctx).SetManualReportScore(ctx, db.SetManualReportScoreParams{
		TenantID: tenantID, AcademicYearID: yearID, TermID: termID, ClassID: classID, SubjectID: subjectID, StudentUserID: studentID,
		ManualScore: pdatabase.NumericPtr(manual),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return service.ReportScore{}, domain.ErrComponentNotFound
	}
	if err != nil {
		return service.ReportScore{}, fmt.Errorf("set manual score: %w", err)
	}
	return toReportScore(row), nil
}

func (r *Repository) ListReportScores(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) ([]service.ReportScore, error) {
	rows, err := r.queries(ctx).ListReportScores(ctx, db.ListReportScoresParams{TenantID: tenantID, TermID: termID, ClassID: classID, SubjectID: subjectID})
	if err != nil {
		return nil, fmt.Errorf("list report scores: %w", err)
	}
	return toReportScores(rows), nil
}

func (r *Repository) ListReportScoresForStudent(ctx context.Context, tenantID, termID, studentID uuid.UUID) ([]service.ReportScore, error) {
	rows, err := r.queries(ctx).ListReportScoresForStudent(ctx, db.ListReportScoresForStudentParams{TenantID: tenantID, TermID: termID, StudentUserID: studentID})
	if err != nil {
		return nil, fmt.Errorf("list student report scores: %w", err)
	}
	return toReportScores(rows), nil
}

// Grade ranges.

func (r *Repository) ListGradeRanges(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.GradeRange, error) {
	rows, err := r.queries(ctx).ListAllGradeRanges(ctx, db.ListAllGradeRangesParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, fmt.Errorf("list grade ranges: %w", err)
	}
	out := make([]domain.GradeRange, len(rows))
	for i, row := range rows {
		out[i] = toGradeRange(row)
	}
	return out, nil
}

func (r *Repository) CreateGradeRange(ctx context.Context, tenantID, yearID uuid.UUID, g domain.GradeRange) (domain.GradeRange, error) {
	row, err := r.queries(ctx).CreateGradeRange(ctx, db.CreateGradeRangeParams{
		TenantID: tenantID, AcademicYearID: yearID, SubjectID: pdatabase.NullUUID(g.SubjectID), TeacherUserID: pdatabase.NullUUID(g.TeacherUserID),
		MinScore: pdatabase.Numeric(g.MinScore), MaxScore: pdatabase.Numeric(g.MaxScore), IncreaseAmount: pdatabase.Numeric(g.IncreaseAmount),
	})
	if err != nil {
		return domain.GradeRange{}, fmt.Errorf("create grade range: %w", err)
	}
	return toGradeRange(row), nil
}

func (r *Repository) DeleteGradeRange(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteGradeRange(ctx, db.DeleteGradeRangeParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete grade range: %w", err)
	}
	return nil
}

// ReplaceGradeRanges deletes every existing range of this subject-teacher
// scope and re-inserts the replacement set, so a save always leaves
// exactly the ranges the caller submitted.
func (r *Repository) ReplaceGradeRanges(ctx context.Context, tenantID, yearID, subjectID uuid.UUID, teacherUserID uuid.NullUUID, ranges []domain.GradeRange) ([]domain.GradeRange, error) {
	q := r.queries(ctx)
	if err := q.ReplaceGradeRangesScope(ctx, db.ReplaceGradeRangesScopeParams{
		TenantID: tenantID, AcademicYearID: yearID, SubjectID: pgtype.UUID{Bytes: subjectID, Valid: true}, TeacherUserID: pdatabase.NullUUID(teacherUserID),
	}); err != nil {
		return nil, fmt.Errorf("replace grade ranges: %w", err)
	}
	out := make([]domain.GradeRange, len(ranges))
	for i, rg := range ranges {
		row, err := q.CreateGradeRange(ctx, db.CreateGradeRangeParams{
			TenantID: tenantID, AcademicYearID: yearID, SubjectID: pdatabase.NullUUID(rg.SubjectID), TeacherUserID: pdatabase.NullUUID(rg.TeacherUserID),
			MinScore: pdatabase.Numeric(rg.MinScore), MaxScore: pdatabase.Numeric(rg.MaxScore), IncreaseAmount: pdatabase.Numeric(rg.IncreaseAmount),
		})
		if err != nil {
			return nil, fmt.Errorf("create grade range: %w", err)
		}
		out[i] = toGradeRange(row)
	}
	return out, nil
}

// TP mapping (e-Rapor legacy export).

func (r *Repository) UpsertTPMapping(ctx context.Context, tenantID uuid.UUID, m domain.TPMapping) (domain.TPMapping, error) {
	row, err := r.queries(ctx).UpsertTPMapping(ctx, db.UpsertTPMappingParams{
		TenantID: tenantID, ComponentID: m.ComponentID, ExportCode: m.ExportCode,
		RMin: pdatabase.Numeric(m.RMin), RMax: pdatabase.Numeric(m.RMax), TMin: pdatabase.Numeric(m.TMin), TMax: pdatabase.Numeric(m.TMax),
	})
	if isUnique(err) {
		return domain.TPMapping{}, domain.ErrTPExportCodeExists
	}
	if err != nil {
		return domain.TPMapping{}, fmt.Errorf("upsert tp mapping: %w", err)
	}
	return toTPMapping(row), nil
}

func (r *Repository) GetTPMapping(ctx context.Context, tenantID, id uuid.UUID) (domain.TPMapping, bool, error) {
	row, err := r.queries(ctx).GetTPMapping(ctx, db.GetTPMappingParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TPMapping{}, false, nil
	}
	if err != nil {
		return domain.TPMapping{}, false, fmt.Errorf("get tp mapping: %w", err)
	}
	return toTPMapping(row), true, nil
}

func (r *Repository) ListTPMappingsForComponents(ctx context.Context, tenantID uuid.UUID, componentIDs []uuid.UUID) ([]domain.TPMapping, error) {
	if len(componentIDs) == 0 {
		return nil, nil
	}
	rows, err := r.queries(ctx).ListTPMappings(ctx, db.ListTPMappingsParams{TenantID: tenantID, ComponentIds: componentIDs})
	if err != nil {
		return nil, fmt.Errorf("list tp mappings: %w", err)
	}
	out := make([]domain.TPMapping, len(rows))
	for i, row := range rows {
		out[i] = toTPMapping(row)
	}
	return out, nil
}

func (r *Repository) DeleteTPMapping(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteTPMapping(ctx, db.DeleteTPMappingParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete tp mapping: %w", err)
	}
	return nil
}

// Stars.

func (r *Repository) InsertStarEvent(ctx context.Context, e domain.StarEvent) (domain.StarEvent, error) {
	row, err := r.queries(ctx).InsertStarEvent(ctx, db.InsertStarEventParams{
		TenantID: e.TenantID, AcademicYearID: e.AcademicYearID, ClassID: e.ClassID, SubjectID: pdatabase.NullUUID(e.SubjectID),
		StudentUserID: e.StudentUserID, TeacherUserID: e.TeacherUserID, Delta: int32(e.Delta), Note: e.Note, VisibleToStudent: e.VisibleToStudent, //nolint:gosec // small
	})
	if err != nil {
		return domain.StarEvent{}, fmt.Errorf("insert star event: %w", err)
	}
	return toStarEvent(row), nil
}

func (r *Repository) StarBalance(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error) {
	balance, err := r.queries(ctx).StarBalance(ctx, db.StarBalanceParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return 0, fmt.Errorf("star balance: %w", err)
	}
	return int(balance), nil
}

func (r *Repository) VisibleStarBalance(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error) {
	balance, err := r.queries(ctx).VisibleStarBalance(ctx, db.VisibleStarBalanceParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return 0, fmt.Errorf("visible star balance: %w", err)
	}
	return int(balance), nil
}

func (r *Repository) LockStarBalance(ctx context.Context, tenantID, studentID uuid.UUID) error {
	if err := r.queries(ctx).LockStarBalance(ctx, db.LockStarBalanceParams{Column1: tenantID.String(), Column2: studentID.String()}); err != nil {
		return fmt.Errorf("lock star balance: %w", err)
	}
	return nil
}

func (r *Repository) MyStarsGrouped(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]service.MyStarGroup, error) {
	rows, err := r.queries(ctx).MyStarsGrouped(ctx, db.MyStarsGroupedParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return nil, fmt.Errorf("my stars grouped: %w", err)
	}
	out := make([]service.MyStarGroup, len(rows))
	for i, row := range rows {
		out[i] = service.MyStarGroup{
			SubjectID: pdatabase.UUIDOrNil(row.SubjectID), SubjectName: row.SubjectName,
			TeacherUserID: row.TeacherUserID, TeacherName: row.TeacherName, Total: int(row.Total),
			LastAwardedAt: pdatabase.TimeOrZero(row.LastAwardedAt),
		}
	}
	return out, nil
}

func (r *Repository) ListStarEvents(ctx context.Context, tenantID, yearID, studentID uuid.UUID, includeHidden bool, limit int) ([]domain.StarEvent, error) {
	rows, err := r.queries(ctx).ListStarEventsForStudent(ctx, db.ListStarEventsForStudentParams{
		TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID, IncludeHidden: includeHidden, Limit: int32(limit), //nolint:gosec // clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list star events: %w", err)
	}
	out := make([]domain.StarEvent, len(rows))
	for i, row := range rows {
		out[i] = toStarEvent(row)
	}
	return out, nil
}

func (r *Repository) ListStarBalances(ctx context.Context, tenantID, yearID, classID uuid.UUID) ([]service.StarBalance, error) {
	rows, err := r.queries(ctx).ListStarBalancesForClass(ctx, db.ListStarBalancesForClassParams{TenantID: tenantID, AcademicYearID: yearID, ClassID: classID})
	if err != nil {
		return nil, fmt.Errorf("list star balances: %w", err)
	}
	out := make([]service.StarBalance, len(rows))
	for i, row := range rows {
		out[i] = service.StarBalance{StudentUserID: row.StudentUserID, Balance: int(row.Balance)}
	}
	return out, nil
}

// Cross-module reads and policy.

func (r *Repository) ActiveTerm(ctx context.Context, tenantID, yearID uuid.UUID) (service.Term, bool, error) {
	row, err := r.queries(ctx).GradingActiveTerm(ctx, db.GradingActiveTermParams{TenantID: tenantID, AcademicYearID: yearID})
	if errors.Is(err, pgx.ErrNoRows) {
		return service.Term{}, false, nil
	}
	if err != nil {
		return service.Term{}, false, fmt.Errorf("active term: %w", err)
	}
	return service.Term{ID: row.ID, AcademicYearID: yearID, Name: row.Name}, true, nil
}

func (r *Repository) GetTerm(ctx context.Context, tenantID, termID uuid.UUID) (service.Term, bool, error) {
	row, err := r.queries(ctx).GradingGetTerm(ctx, db.GradingGetTermParams{TenantID: tenantID, ID: termID})
	if errors.Is(err, pgx.ErrNoRows) {
		return service.Term{}, false, nil
	}
	if err != nil {
		return service.Term{}, false, fmt.Errorf("get term: %w", err)
	}
	return service.Term{ID: row.ID, AcademicYearID: row.AcademicYearID, Name: row.Name, Sequence: int(row.Sequence)}, true, nil
}

func (r *Repository) PreviousTermID(ctx context.Context, tenantID, yearID uuid.UUID, sequence int) (uuid.NullUUID, error) {
	id, err := r.queries(ctx).GradingPreviousTerm(ctx, db.GradingPreviousTermParams{TenantID: tenantID, AcademicYearID: yearID, Sequence: int16(sequence)}) //nolint:gosec // small
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.NullUUID{}, nil
	}
	if err != nil {
		return uuid.NullUUID{}, fmt.Errorf("previous term: %w", err)
	}
	return uuid.NullUUID{UUID: id, Valid: true}, nil
}

func (r *Repository) ClassStudentIDs(ctx context.Context, tenantID, yearID, classID uuid.UUID) ([]uuid.UUID, error) {
	ids, err := r.queries(ctx).GradingClassStudentIDs(ctx, db.GradingClassStudentIDsParams{TenantID: tenantID, AcademicYearID: yearID, ClassID: classID})
	if err != nil {
		return nil, fmt.Errorf("class students: %w", err)
	}
	return ids, nil
}

// GetClassName resolves classID's display name, for the gradebook
// export's class scope Section name.
func (r *Repository) GetClassName(ctx context.Context, tenantID, classID uuid.UUID) (string, error) {
	return r.queries(ctx).GradingGetClassName(ctx, db.GradingGetClassNameParams{TenantID: tenantID, ID: classID})
}

// GetGradeLevelName resolves gradeLevelID's display name, for the
// gradebook export's grade-level ("angkatan") scope line.
func (r *Repository) GetGradeLevelName(ctx context.Context, tenantID, gradeLevelID uuid.UUID) (string, error) {
	return r.queries(ctx).GradingGetGradeLevelName(ctx, db.GradingGetGradeLevelNameParams{TenantID: tenantID, ID: gradeLevelID})
}

// GetSubjectName resolves subjectID's display name, for the gradebook
// export's scope line.
func (r *Repository) GetSubjectName(ctx context.Context, tenantID, subjectID uuid.UUID) (string, error) {
	return r.queries(ctx).GradingGetSubjectName(ctx, db.GradingGetSubjectNameParams{TenantID: tenantID, ID: subjectID})
}

// ListClassesByGradeLevel resolves the grade-level ("angkatan") scope for
// the gradebook export: every class of the academic year under
// gradeLevelID, ordered by name.
func (r *Repository) ListClassesByGradeLevel(ctx context.Context, tenantID, yearID, gradeLevelID uuid.UUID) ([]service.ClassRef, error) {
	rows, err := r.queries(ctx).GradingListClassesByGradeLevel(ctx, db.GradingListClassesByGradeLevelParams{TenantID: tenantID, AcademicYearID: yearID, GradeLevelID: gradeLevelID})
	if err != nil {
		return nil, fmt.Errorf("list classes by grade level: %w", err)
	}
	out := make([]service.ClassRef, len(rows))
	for i, row := range rows {
		out[i] = service.ClassRef{ID: row.ID, Name: row.Name}
	}
	return out, nil
}

func (r *Repository) StudentClassID(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (uuid.NullUUID, error) {
	id, err := r.queries(ctx).GradingStudentClassID(ctx, db.GradingStudentClassIDParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.NullUUID{}, nil
	}
	if err != nil {
		return uuid.NullUUID{}, fmt.Errorf("student class: %w", err)
	}
	return uuid.NullUUID{UUID: id, Valid: true}, nil
}

func (r *Repository) TeacherTeaches(ctx context.Context, tenantID, yearID, teacherID, classID, subjectID uuid.UUID) (bool, error) {
	return r.queries(ctx).GradingTeacherTeaches(ctx, db.GradingTeacherTeachesParams{
		TenantID: tenantID, AcademicYearID: yearID, TeacherUserID: teacherID, ClassID: classID, SubjectID: subjectID,
	})
}

func (r *Repository) TeacherTeachesClass(ctx context.Context, tenantID, yearID, teacherID, classID uuid.UUID) (bool, error) {
	return r.queries(ctx).GradingTeacherTeachesClass(ctx, db.GradingTeacherTeachesClassParams{
		TenantID: tenantID, AcademicYearID: yearID, TeacherUserID: teacherID, ClassID: classID,
	})
}

func (r *Repository) StudentNames(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	if len(ids) == 0 {
		return map[uuid.UUID]string{}, nil
	}
	rows, err := r.queries(ctx).GradingStudentNames(ctx, db.GradingStudentNamesParams{TenantID: tenantID, UserIds: ids})
	if err != nil {
		return nil, fmt.Errorf("student names: %w", err)
	}
	out := make(map[uuid.UUID]string, len(rows))
	for _, row := range rows {
		out[row.ID] = row.Name
	}
	return out, nil
}

// e-Rapor export.

func (r *Repository) ListClassSubjects(ctx context.Context, tenantID, yearID, classID uuid.UUID) ([]service.EraporSubject, error) {
	rows, err := r.queries(ctx).GradingClassSubjects(ctx, db.GradingClassSubjectsParams{TenantID: tenantID, AcademicYearID: yearID, ClassID: classID})
	if err != nil {
		return nil, fmt.Errorf("list class subjects: %w", err)
	}
	out := make([]service.EraporSubject, len(rows))
	for i, row := range rows {
		out[i] = service.EraporSubject{ID: row.ID, Code: row.Code, Name: row.Name}
	}
	return out, nil
}

func (r *Repository) StudentNISNs(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]service.EraporStudent, error) {
	if len(ids) == 0 {
		return map[uuid.UUID]service.EraporStudent{}, nil
	}
	rows, err := r.queries(ctx).GradingStudentNISNs(ctx, db.GradingStudentNISNsParams{TenantID: tenantID, UserIds: ids})
	if err != nil {
		return nil, fmt.Errorf("list student nisns: %w", err)
	}
	out := make(map[uuid.UUID]service.EraporStudent, len(rows))
	for _, row := range rows {
		out[row.ID] = service.EraporStudent{Name: row.Name, NIS: row.Nis, NISN: row.Nisn}
	}
	return out, nil
}

func (r *Repository) GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) ([]byte, int, bool, error) {
	row, err := r.queries(ctx).GradingGetLatestPolicy(ctx, db.GradingGetLatestPolicyParams{TenantID: tenantID, Kind: kind})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, false, nil
	}
	if err != nil {
		return nil, 0, false, fmt.Errorf("get policy: %w", err)
	}
	return row.Config, int(row.Version), true, nil
}

func (r *Repository) CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error {
	if err := r.queries(ctx).GradingCreatePolicy(ctx, db.GradingCreatePolicyParams{
		TenantID: tenantID, Kind: kind, Version: int32(version), Config: config, EffectiveFrom: pdatabase.Date(effectiveFrom), CreatedBy: pdatabase.NullUUID(createdBy), //nolint:gosec // small
	}); err != nil {
		return fmt.Errorf("create policy: %w", err)
	}
	return nil
}

// Mapping.

func toComponent(row db.AssessmentComponent) domain.Component {
	return domain.Component{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, TermID: row.TermID, TeacherUserID: row.TeacherUserID,
		ClassID: row.ClassID, SubjectID: row.SubjectID, Code: row.Code, Kind: domain.ComponentKind(row.Kind), Description: row.Description,
		KKTP: pdatabase.FloatPtr(row.Kktp), Weight: pdatabase.FloatOrZero(row.Weight), Sequence: int(row.Sequence),
	}
}

func toPublication(row db.GradePublication) service.Publication {
	return service.Publication{TermID: row.TermID, ClassID: row.ClassID, SubjectID: row.SubjectID, IsPublished: row.IsPublished, PublishedAt: pdatabase.TimePtr(row.PublishedAt)}
}

func toReportScore(row db.ReportScore) service.ReportScore {
	return service.ReportScore{
		TermID: row.TermID, ClassID: row.ClassID, SubjectID: row.SubjectID, StudentUserID: row.StudentUserID,
		PreviousScore: pdatabase.FloatPtr(row.PreviousScore), ManualScore: pdatabase.FloatPtr(row.ManualScore),
		AutomaticScore: pdatabase.FloatPtr(row.AutomaticScore),
		FinalScore:     pdatabase.FloatOrZero(row.FinalScore), ComputedAt: pdatabase.TimeOrZero(row.ComputedAt),
	}
}

func toReportScores(rows []db.ReportScore) []service.ReportScore {
	out := make([]service.ReportScore, len(rows))
	for i, row := range rows {
		out[i] = toReportScore(row)
	}
	return out
}

func toGradeRange(row db.ReportGradeRange) domain.GradeRange {
	return domain.GradeRange{
		ID: row.ID, SubjectID: pdatabase.UUIDOrNil(row.SubjectID), TeacherUserID: pdatabase.UUIDOrNil(row.TeacherUserID),
		MinScore: pdatabase.FloatOrZero(row.MinScore), MaxScore: pdatabase.FloatOrZero(row.MaxScore), IncreaseAmount: pdatabase.FloatOrZero(row.IncreaseAmount),
	}
}

func toTPMapping(row db.ReportTpMapping) domain.TPMapping {
	return domain.TPMapping{
		ID: row.ID, ComponentID: row.ComponentID, ExportCode: row.ExportCode,
		RMin: pdatabase.FloatOrZero(row.RMin), RMax: pdatabase.FloatOrZero(row.RMax),
		TMin: pdatabase.FloatOrZero(row.TMin), TMax: pdatabase.FloatOrZero(row.TMax),
	}
}

func toStarEvent(row db.StarEvent) domain.StarEvent {
	return domain.StarEvent{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, ClassID: row.ClassID, SubjectID: pdatabase.UUIDOrNil(row.SubjectID),
		StudentUserID: row.StudentUserID, TeacherUserID: row.TeacherUserID, Delta: int(row.Delta), Note: row.Note,
		VisibleToStudent: row.VisibleToStudent, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}
