// Package repository is the sqlc-backed implementation of the mentoring
// service's data boundary.
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/service"
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

func (r *Repository) GetGroupSizeLimit(ctx context.Context, tenantID uuid.UUID) (int, bool, error) {
	limit, err := r.queries(ctx).MentoringGetGroupSizeLimit(ctx, tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("get group size limit: %w", err)
	}
	return int(limit), true, nil
}

func (r *Repository) SetGroupSizeLimit(ctx context.Context, tenantID uuid.UUID, limit int) error {
	err := r.queries(ctx).MentoringUpsertGroupSizeLimit(ctx, db.MentoringUpsertGroupSizeLimitParams{
		TenantID: tenantID, GroupSizeLimit: int32(limit), //nolint:gosec // validated >= 1 by domain.GroupSizeLimit.Validate
	})
	if err != nil {
		return fmt.Errorf("set group size limit: %w", err)
	}
	return nil
}

func (r *Repository) CreateGroup(ctx context.Context, g domain.MentorGroup) (domain.MentorGroup, error) {
	row, err := r.queries(ctx).MentoringCreateGroup(ctx, db.MentoringCreateGroupParams{
		TenantID: g.TenantID, AcademicYearID: g.AcademicYearID, MentorUserID: g.MentorUserID, Name: g.Name,
	})
	if err != nil {
		return domain.MentorGroup{}, fmt.Errorf("create group: %w", err)
	}
	return toGroup(row), nil
}

func (r *Repository) GetGroup(ctx context.Context, tenantID, id uuid.UUID) (domain.MentorGroup, bool, error) {
	row, err := r.queries(ctx).MentoringGetGroup(ctx, db.MentoringGetGroupParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MentorGroup{}, false, nil
	}
	if err != nil {
		return domain.MentorGroup{}, false, fmt.Errorf("get group: %w", err)
	}
	return toGroup(row), true, nil
}

func (r *Repository) UpdateGroup(ctx context.Context, g domain.MentorGroup) (domain.MentorGroup, error) {
	row, err := r.queries(ctx).MentoringUpdateGroup(ctx, db.MentoringUpdateGroupParams{
		TenantID: g.TenantID, ID: g.ID, Name: g.Name, MentorUserID: g.MentorUserID,
	})
	if err != nil {
		return domain.MentorGroup{}, fmt.Errorf("update group: %w", err)
	}
	return toGroup(row), nil
}

func (r *Repository) DeleteGroup(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).MentoringDeleteGroup(ctx, db.MentoringDeleteGroupParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete group: %w", err)
	}
	return nil
}

func (r *Repository) ListGroupsForMentor(ctx context.Context, tenantID, yearID, mentorUserID uuid.UUID) ([]domain.MentorGroup, error) {
	rows, err := r.queries(ctx).MentoringListGroupsForMentor(ctx, db.MentoringListGroupsForMentorParams{
		TenantID: tenantID, AcademicYearID: yearID, MentorUserID: mentorUserID,
	})
	if err != nil {
		return nil, fmt.Errorf("list groups for mentor: %w", err)
	}
	return toGroups(rows), nil
}

func (r *Repository) ListGroupsForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.MentorGroup, error) {
	rows, err := r.queries(ctx).MentoringListGroupsForYear(ctx, db.MentoringListGroupsForYearParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, fmt.Errorf("list groups for year: %w", err)
	}
	return toGroups(rows), nil
}

func (r *Repository) CountGroupMembers(ctx context.Context, tenantID, groupID uuid.UUID) (int, error) {
	count, err := r.queries(ctx).MentoringCountGroupMembers(ctx, db.MentoringCountGroupMembersParams{TenantID: tenantID, GroupID: groupID})
	if err != nil {
		return 0, fmt.Errorf("count group members: %w", err)
	}
	return int(count), nil
}

func (r *Repository) AddGroupMember(ctx context.Context, tenantID, yearID uuid.UUID, m domain.GroupMember) (domain.GroupMember, error) {
	row, err := r.queries(ctx).MentoringAddGroupMember(ctx, db.MentoringAddGroupMemberParams{
		TenantID: tenantID, GroupID: m.GroupID, AcademicYearID: yearID, StudentUserID: m.StudentUserID,
	})
	if err != nil {
		return domain.GroupMember{}, fmt.Errorf("add group member: %w", err)
	}
	return toMember(row), nil
}

func (r *Repository) RemoveGroupMember(ctx context.Context, tenantID, groupID, studentUserID uuid.UUID) error {
	err := r.queries(ctx).MentoringRemoveGroupMember(ctx, db.MentoringRemoveGroupMemberParams{
		TenantID: tenantID, GroupID: groupID, StudentUserID: studentUserID,
	})
	if err != nil {
		return fmt.Errorf("remove group member: %w", err)
	}
	return nil
}

func (r *Repository) ListGroupMembers(ctx context.Context, tenantID, groupID uuid.UUID) ([]domain.GroupMember, error) {
	rows, err := r.queries(ctx).MentoringListGroupMembers(ctx, db.MentoringListGroupMembersParams{TenantID: tenantID, GroupID: groupID})
	if err != nil {
		return nil, fmt.Errorf("list group members: %w", err)
	}
	out := make([]domain.GroupMember, len(rows))
	for i, row := range rows {
		out[i] = toMember(row)
	}
	return out, nil
}

func (r *Repository) FindMembershipForStudent(ctx context.Context, tenantID, yearID, studentUserID uuid.UUID) (domain.GroupMember, bool, error) {
	row, err := r.queries(ctx).MentoringFindMembershipForStudent(ctx, db.MentoringFindMembershipForStudentParams{
		TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentUserID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.GroupMember{}, false, nil
	}
	if err != nil {
		return domain.GroupMember{}, false, fmt.Errorf("find membership: %w", err)
	}
	return toMember(row), true, nil
}

func (r *Repository) CreateMeetingNote(ctx context.Context, n domain.MeetingNote, content, agreedActions []byte, keyID string) (domain.MeetingNote, error) {
	row, err := r.queries(ctx).MentoringCreateMeetingNote(ctx, db.MentoringCreateMeetingNoteParams{
		TenantID: n.TenantID, AcademicYearID: n.AcademicYearID, GroupID: n.GroupID, MentorUserID: n.MentorUserID,
		MetAt: pdatabase.Timestamptz(n.MetAt), Kind: string(n.Kind), AttendeeUserIds: n.AttendeeUserIDs, Topic: n.Topic,
		ContentEncrypted: content, ContentKeyID: keyID, AgreedActionsEncrypted: agreedActions,
	})
	if err != nil {
		return domain.MeetingNote{}, fmt.Errorf("create meeting note: %w", err)
	}
	return toNote(row).MeetingNote, nil
}

func (r *Repository) UpdateMeetingNote(ctx context.Context, n domain.MeetingNote, content, agreedActions []byte, keyID string) (domain.MeetingNote, error) {
	row, err := r.queries(ctx).MentoringUpdateMeetingNote(ctx, db.MentoringUpdateMeetingNoteParams{
		TenantID: n.TenantID, ID: n.ID, MetAt: pdatabase.Timestamptz(n.MetAt), Kind: string(n.Kind),
		AttendeeUserIds: n.AttendeeUserIDs, Topic: n.Topic, ContentEncrypted: content, ContentKeyID: keyID, AgreedActionsEncrypted: agreedActions,
	})
	if err != nil {
		return domain.MeetingNote{}, fmt.Errorf("update meeting note: %w", err)
	}
	return toNote(row).MeetingNote, nil
}

func (r *Repository) GetMeetingNote(ctx context.Context, tenantID, id uuid.UUID) (service.EncryptedMeetingNote, bool, error) {
	row, err := r.queries(ctx).MentoringGetMeetingNote(ctx, db.MentoringGetMeetingNoteParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return service.EncryptedMeetingNote{}, false, nil
	}
	if err != nil {
		return service.EncryptedMeetingNote{}, false, fmt.Errorf("get meeting note: %w", err)
	}
	return toNote(row), true, nil
}

func (r *Repository) ListMeetingNotesForGroup(ctx context.Context, tenantID, groupID uuid.UUID) ([]service.EncryptedMeetingNote, error) {
	rows, err := r.queries(ctx).MentoringListMeetingNotesForGroup(ctx, db.MentoringListMeetingNotesForGroupParams{TenantID: tenantID, GroupID: groupID})
	if err != nil {
		return nil, fmt.Errorf("list meeting notes: %w", err)
	}
	out := make([]service.EncryptedMeetingNote, len(rows))
	for i, row := range rows {
		out[i] = toNote(row)
	}
	return out, nil
}

func (r *Repository) DeleteMeetingNote(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).MentoringDeleteMeetingNote(ctx, db.MentoringDeleteMeetingNoteParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete meeting note: %w", err)
	}
	return nil
}

func (r *Repository) UpsertTermSummary(ctx context.Context, s domain.TermSummary) (domain.TermSummary, error) {
	row, err := r.queries(ctx).MentoringUpsertTermSummary(ctx, db.MentoringUpsertTermSummaryParams{
		TenantID: s.TenantID, TermID: s.TermID, GroupID: s.GroupID, StudentUserID: s.StudentUserID,
		MentorUserID: s.MentorUserID, Summary: s.Summary,
	})
	if err != nil {
		return domain.TermSummary{}, fmt.Errorf("upsert term summary: %w", err)
	}
	return toSummary(row), nil
}

func (r *Repository) GetTermSummary(ctx context.Context, tenantID, termID, studentUserID uuid.UUID) (domain.TermSummary, bool, error) {
	row, err := r.queries(ctx).MentoringGetTermSummary(ctx, db.MentoringGetTermSummaryParams{
		TenantID: tenantID, TermID: termID, StudentUserID: studentUserID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TermSummary{}, false, nil
	}
	if err != nil {
		return domain.TermSummary{}, false, fmt.Errorf("get term summary: %w", err)
	}
	return toSummary(row), true, nil
}

func (r *Repository) ListTermSummariesForGroup(ctx context.Context, tenantID, termID, groupID uuid.UUID) ([]domain.TermSummary, error) {
	rows, err := r.queries(ctx).MentoringListTermSummariesForGroup(ctx, db.MentoringListTermSummariesForGroupParams{
		TenantID: tenantID, TermID: termID, GroupID: groupID,
	})
	if err != nil {
		return nil, fmt.Errorf("list term summaries: %w", err)
	}
	out := make([]domain.TermSummary, len(rows))
	for i, row := range rows {
		out[i] = toSummary(row)
	}
	return out, nil
}

func (r *Repository) HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string) (bool, error) {
	has, err := r.queries(ctx).MentoringHasActiveDuty(ctx, db.MentoringHasActiveDutyParams{
		TenantID: tenantID, AcademicYearID: yearID, UserID: userID, Slug: slug,
	})
	if err != nil {
		return false, fmt.Errorf("has active duty: %w", err)
	}
	return has, nil
}

func (r *Repository) StudentInfo(ctx context.Context, tenantID, yearID, studentUserID uuid.UUID) (service.StudentInfo, error) {
	row, err := r.queries(ctx).MentoringStudentInfo(ctx, db.MentoringStudentInfoParams{
		TenantID: tenantID, AcademicYearID: yearID, ID: studentUserID,
	})
	if err != nil {
		return service.StudentInfo{}, fmt.Errorf("student info: %w", err)
	}
	return service.StudentInfo{Name: row.StudentName, ClassName: row.ClassName}, nil
}

// Mapping.

func toGroup(row db.MentorGroup) domain.MentorGroup {
	return domain.MentorGroup{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, MentorUserID: row.MentorUserID,
		Name: row.Name, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toGroups(rows []db.MentorGroup) []domain.MentorGroup {
	out := make([]domain.MentorGroup, len(rows))
	for i, row := range rows {
		out[i] = toGroup(row)
	}
	return out
}

func toMember(row db.MentorGroupMember) domain.GroupMember {
	return domain.GroupMember{
		ID: row.ID, GroupID: row.GroupID, StudentUserID: row.StudentUserID, AssignedAt: pdatabase.TimeOrZero(row.AssignedAt),
	}
}

func toNote(row db.MentorMeetingNote) service.EncryptedMeetingNote {
	return service.EncryptedMeetingNote{
		MeetingNote: domain.MeetingNote{
			ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, GroupID: row.GroupID, MentorUserID: row.MentorUserID,
			MetAt: pdatabase.TimeOrZero(row.MetAt), Kind: domain.MeetingKind(row.Kind), AttendeeUserIDs: row.AttendeeUserIds, Topic: row.Topic,
			CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
		},
		ContentEncrypted: row.ContentEncrypted, AgreedActionsEncrypted: row.AgreedActionsEncrypted, ContentKeyID: row.ContentKeyID,
	}
}

func toSummary(row db.MentorTermSummary) domain.TermSummary {
	return domain.TermSummary{
		ID: row.ID, TenantID: row.TenantID, TermID: row.TermID, GroupID: row.GroupID, StudentUserID: row.StudentUserID,
		MentorUserID: row.MentorUserID, Summary: row.Summary, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}
