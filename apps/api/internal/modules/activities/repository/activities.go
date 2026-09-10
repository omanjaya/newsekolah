package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toActivity(row db.SchoolActivity) domain.Activity {
	return domain.Activity{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, Name: row.Name, Description: row.Description,
		Location: row.Location, StartDate: pdatabase.DateOrZero(row.StartDate), EndDate: pdatabase.DateOrZero(row.EndDate),
		OrganiserID: pdatabase.UUIDOrNil(row.OrganiserUserID), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toParticipant(row db.ActivityParticipant) domain.Participant {
	p := domain.Participant{
		ID: row.ID, ClassID: pdatabase.UUIDOrNil(row.ClassID), GradeLevelID: pdatabase.UUIDOrNil(row.GradeLevelID),
		StudentID: pdatabase.UUIDOrNil(row.StudentUserID),
	}
	switch {
	case p.ClassID.Valid:
		p.Scope = domain.ScopeClass
	case p.GradeLevelID.Valid:
		p.Scope = domain.ScopeGradeLevel
	default:
		p.Scope = domain.ScopeStudent
	}
	return p
}

func optionalDate(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return pdatabase.Date(*t)
}

func (r *Repository) CreateActivity(ctx context.Context, a domain.Activity) (domain.Activity, error) {
	row, err := r.queries(ctx).CreateActivity(ctx, db.CreateActivityParams{
		TenantID: a.TenantID, AcademicYearID: a.AcademicYearID, Name: a.Name, Description: a.Description,
		Location: a.Location, StartDate: pdatabase.Date(a.StartDate), EndDate: pdatabase.Date(a.EndDate), OrganiserUserID: pdatabase.NullUUID(a.OrganiserID),
	})
	if err != nil {
		return domain.Activity{}, fmt.Errorf("create activity: %w", err)
	}
	return toActivity(row), nil
}

func (r *Repository) GetActivity(ctx context.Context, tenantID, id uuid.UUID) (domain.Activity, bool, error) {
	row, err := r.queries(ctx).GetActivity(ctx, db.GetActivityParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Activity{}, false, nil
	}
	if err != nil {
		return domain.Activity{}, false, fmt.Errorf("get activity: %w", err)
	}
	return toActivity(row), true, nil
}

func (r *Repository) UpdateActivity(ctx context.Context, a domain.Activity) (domain.Activity, error) {
	row, err := r.queries(ctx).UpdateActivity(ctx, db.UpdateActivityParams{
		TenantID: a.TenantID, ID: a.ID, Name: a.Name, Description: a.Description, Location: a.Location,
		StartDate: pdatabase.Date(a.StartDate), EndDate: pdatabase.Date(a.EndDate), OrganiserUserID: pdatabase.NullUUID(a.OrganiserID),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Activity{}, domain.ErrActivityNotFound
	}
	if err != nil {
		return domain.Activity{}, fmt.Errorf("update activity: %w", err)
	}
	return toActivity(row), nil
}

func (r *Repository) DeleteActivity(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteActivity(ctx, db.DeleteActivityParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete activity: %w", err)
	}
	return nil
}

func (r *Repository) ListActivities(ctx context.Context, tenantID, yearID uuid.UUID, from, to *time.Time) ([]domain.Activity, error) {
	rows, err := r.queries(ctx).ListActivities(ctx, db.ListActivitiesParams{
		TenantID: tenantID, AcademicYearID: yearID, FromDate: optionalDate(from), ToDate: optionalDate(to),
	})
	if err != nil {
		return nil, fmt.Errorf("list activities: %w", err)
	}
	out := make([]domain.Activity, len(rows))
	for i, row := range rows {
		out[i] = toActivity(row)
	}
	return out, nil
}

func (r *Repository) AddParticipant(ctx context.Context, tenantID, activityID uuid.UUID, p domain.Participant) (domain.Participant, error) {
	row, err := r.queries(ctx).AddParticipant(ctx, db.AddParticipantParams{
		TenantID: tenantID, ActivityID: activityID, ClassID: pdatabase.NullUUID(p.ClassID),
		GradeLevelID: pdatabase.NullUUID(p.GradeLevelID), StudentUserID: pdatabase.NullUUID(p.StudentID),
	})
	if isUnique(err) {
		return domain.Participant{}, domain.ErrInvalidParticipant
	}
	if err != nil {
		return domain.Participant{}, fmt.Errorf("add participant: %w", err)
	}
	return toParticipant(row), nil
}

func (r *Repository) RemoveParticipant(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).RemoveParticipant(ctx, db.RemoveParticipantParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("remove participant: %w", err)
	}
	return nil
}

func (r *Repository) ListParticipants(ctx context.Context, tenantID, activityID uuid.UUID) ([]domain.Participant, error) {
	rows, err := r.queries(ctx).ListParticipants(ctx, db.ListParticipantsParams{TenantID: tenantID, ActivityID: activityID})
	if err != nil {
		return nil, fmt.Errorf("list participants: %w", err)
	}
	out := make([]domain.Participant, len(rows))
	for i, row := range rows {
		out[i] = toParticipant(row)
	}
	return out, nil
}

// -- achievements --

func toAchievement(row db.StudentAchievement) domain.Achievement {
	return domain.Achievement{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, StudentUserID: row.StudentUserID,
		CompetitionName: row.CompetitionName, Level: domain.AchievementLevel(row.Level), Placing: row.Placement,
		AchievedOn: pdatabase.DateOrZero(row.AchievedOn), Notes: row.Notes, CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) CreateAchievement(ctx context.Context, a domain.Achievement) (domain.Achievement, error) {
	row, err := r.queries(ctx).CreateAchievement(ctx, db.CreateAchievementParams{
		TenantID: a.TenantID, AcademicYearID: a.AcademicYearID, StudentUserID: a.StudentUserID, CompetitionName: a.CompetitionName,
		Level: string(a.Level), Placement: a.Placing, AchievedOn: pdatabase.Date(a.AchievedOn), Notes: a.Notes, CreatedBy: pdatabase.NullUUID(a.CreatedBy),
	})
	if err != nil {
		return domain.Achievement{}, fmt.Errorf("create achievement: %w", err)
	}
	return toAchievement(row), nil
}

func (r *Repository) GetAchievement(ctx context.Context, tenantID, id uuid.UUID) (domain.Achievement, bool, error) {
	row, err := r.queries(ctx).GetAchievement(ctx, db.GetAchievementParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Achievement{}, false, nil
	}
	if err != nil {
		return domain.Achievement{}, false, fmt.Errorf("get achievement: %w", err)
	}
	return toAchievement(row), true, nil
}

func (r *Repository) UpdateAchievement(ctx context.Context, a domain.Achievement) (domain.Achievement, error) {
	row, err := r.queries(ctx).UpdateAchievement(ctx, db.UpdateAchievementParams{
		TenantID: a.TenantID, ID: a.ID, CompetitionName: a.CompetitionName, Level: string(a.Level),
		Placement: a.Placing, AchievedOn: pdatabase.Date(a.AchievedOn), Notes: a.Notes,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Achievement{}, domain.ErrAchievementNotFound
	}
	if err != nil {
		return domain.Achievement{}, fmt.Errorf("update achievement: %w", err)
	}
	return toAchievement(row), nil
}

func (r *Repository) DeleteAchievement(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteAchievement(ctx, db.DeleteAchievementParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete achievement: %w", err)
	}
	return nil
}

func (r *Repository) ListAchievements(ctx context.Context, tenantID, yearID uuid.UUID, studentID, classID uuid.NullUUID) ([]domain.Achievement, error) {
	rows, err := r.queries(ctx).ListAchievements(ctx, db.ListAchievementsParams{
		TenantID: tenantID, AcademicYearID: yearID, StudentID: pdatabase.NullUUID(studentID), ClassID: pdatabase.NullUUID(classID),
	})
	if err != nil {
		return nil, fmt.Errorf("list achievements: %w", err)
	}
	out := make([]domain.Achievement, len(rows))
	for i, row := range rows {
		out[i] = toAchievement(row)
	}
	return out, nil
}
