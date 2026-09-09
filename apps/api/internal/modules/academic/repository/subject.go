package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateSubject(ctx context.Context, tenantID uuid.UUID, code, name string) (domain.Subject, error) {
	row, err := r.queries(ctx).AcademicCreateSubject(ctx, db.AcademicCreateSubjectParams{TenantID: tenantID, Code: code, Name: name})
	if err != nil {
		return domain.Subject{}, err
	}
	return toSubject(row), nil
}

func (r *Repository) UpdateSubject(ctx context.Context, tenantID, id uuid.UUID, code, name string) (domain.Subject, error) {
	row, err := r.queries(ctx).AcademicUpdateSubject(ctx, db.AcademicUpdateSubjectParams{TenantID: tenantID, ID: id, Code: code, Name: name})
	if err != nil {
		return domain.Subject{}, err
	}
	return toSubject(row), nil
}

func (r *Repository) GetSubjectByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Subject, error) {
	row, err := r.queries(ctx).AcademicGetSubjectByID(ctx, db.AcademicGetSubjectByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Subject{}, err
	}
	return toSubject(row), nil
}

func (r *Repository) ListSubjects(ctx context.Context, tenantID uuid.UUID, search string, page service.Page) ([]domain.Subject, int64, error) {
	rows, err := r.queries(ctx).AcademicListSubjects(ctx, db.AcademicListSubjectsParams{
		TenantID: tenantID, Limit: page.Limit, Offset: page.Offset, Search: pdatabase.Text(search),
	})
	if err != nil {
		return nil, 0, err
	}
	subjects := make([]domain.Subject, len(rows))
	var total int64
	for i, row := range rows {
		subjects[i] = toSubject(row.Subject)
		total = row.TotalCount
	}
	return subjects, total, nil
}

func (r *Repository) SoftDeleteSubject(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicSoftDeleteSubject(ctx, db.AcademicSoftDeleteSubjectParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CountOfferingsForSubject(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountOfferingsForSubject(ctx, db.AcademicCountOfferingsForSubjectParams{TenantID: tenantID, SubjectID: id})
}

func (r *Repository) CountTeachingAssignmentsForSubject(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountTeachingAssignmentsForSubject(ctx, db.AcademicCountTeachingAssignmentsForSubjectParams{TenantID: tenantID, SubjectID: id})
}

func (r *Repository) CreateSubjectOffering(ctx context.Context, o domain.SubjectOffering) (domain.SubjectOffering, error) {
	row, err := r.queries(ctx).AcademicCreateSubjectOffering(ctx, db.AcademicCreateSubjectOfferingParams{
		TenantID: o.TenantID, AcademicYearID: o.AcademicYearID, SubjectID: o.SubjectID,
		GradeLevelID: uuidPtrToPg(o.GradeLevelID), HoursPerWeek: o.HoursPerWeek,
	})
	if err != nil {
		return domain.SubjectOffering{}, err
	}
	return toSubjectOffering(row), nil
}

func (r *Repository) UpdateSubjectOffering(ctx context.Context, tenantID, id uuid.UUID, gradeLevelID *uuid.UUID, hoursPerWeek int16) (domain.SubjectOffering, error) {
	row, err := r.queries(ctx).AcademicUpdateSubjectOffering(ctx, db.AcademicUpdateSubjectOfferingParams{
		TenantID: tenantID, ID: id, GradeLevelID: uuidPtrToPg(gradeLevelID), HoursPerWeek: hoursPerWeek,
	})
	if err != nil {
		return domain.SubjectOffering{}, err
	}
	return toSubjectOffering(row), nil
}

func (r *Repository) GetSubjectOfferingByID(ctx context.Context, tenantID, id uuid.UUID) (domain.SubjectOffering, error) {
	row, err := r.queries(ctx).AcademicGetSubjectOfferingByID(ctx, db.AcademicGetSubjectOfferingByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.SubjectOffering{}, err
	}
	return toSubjectOffering(row), nil
}

func (r *Repository) ListSubjectOfferings(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.SubjectOffering, error) {
	rows, err := r.queries(ctx).AcademicListSubjectOfferings(ctx, db.AcademicListSubjectOfferingsParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, err
	}
	offerings := make([]domain.SubjectOffering, len(rows))
	for i, row := range rows {
		offerings[i] = toSubjectOffering(row)
	}
	return offerings, nil
}

func (r *Repository) DeleteSubjectOffering(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicDeleteSubjectOffering(ctx, db.AcademicDeleteSubjectOfferingParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CreateRoom(ctx context.Context, tenantID uuid.UUID, code, name string, capacity *int32) (domain.Room, error) {
	row, err := r.queries(ctx).AcademicCreateRoom(ctx, db.AcademicCreateRoomParams{TenantID: tenantID, Code: code, Name: name, Capacity: int32PtrToPg(capacity)})
	if err != nil {
		return domain.Room{}, err
	}
	return toRoom(row), nil
}

func (r *Repository) UpdateRoom(ctx context.Context, tenantID, id uuid.UUID, code, name string, capacity *int32) (domain.Room, error) {
	row, err := r.queries(ctx).AcademicUpdateRoom(ctx, db.AcademicUpdateRoomParams{TenantID: tenantID, ID: id, Code: code, Name: name, Capacity: int32PtrToPg(capacity)})
	if err != nil {
		return domain.Room{}, err
	}
	return toRoom(row), nil
}

func (r *Repository) GetRoomByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Room, error) {
	row, err := r.queries(ctx).AcademicGetRoomByID(ctx, db.AcademicGetRoomByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Room{}, err
	}
	return toRoom(row), nil
}

func (r *Repository) ListRooms(ctx context.Context, tenantID uuid.UUID, search string, page service.Page) ([]domain.Room, int64, error) {
	rows, err := r.queries(ctx).AcademicListRooms(ctx, db.AcademicListRoomsParams{
		TenantID: tenantID, Limit: page.Limit, Offset: page.Offset, Search: pdatabase.Text(search),
	})
	if err != nil {
		return nil, 0, err
	}
	rooms := make([]domain.Room, len(rows))
	var total int64
	for i, row := range rows {
		rooms[i] = toRoom(row.Room)
		total = row.TotalCount
	}
	return rooms, total, nil
}

func (r *Repository) SoftDeleteRoom(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicSoftDeleteRoom(ctx, db.AcademicSoftDeleteRoomParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CountClassesForRoom(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountClassesForRoom(ctx, db.AcademicCountClassesForRoomParams{TenantID: tenantID, RoomID: uuidPtrToPg(&id)})
}

func toSubject(row db.Subject) domain.Subject {
	return domain.Subject{ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name}
}

func toSubjectOffering(row db.SubjectOffering) domain.SubjectOffering {
	return domain.SubjectOffering{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, SubjectID: row.SubjectID,
		GradeLevelID: pgToUUIDPtr(row.GradeLevelID), HoursPerWeek: row.HoursPerWeek,
	}
}

func toRoom(row db.Room) domain.Room {
	return domain.Room{ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name, Capacity: pgToInt32Ptr(row.Capacity)}
}
