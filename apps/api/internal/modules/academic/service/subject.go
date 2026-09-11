package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

type subjectRepository interface {
	CreateSubject(ctx context.Context, tenantID uuid.UUID, code, name string) (domain.Subject, error)
	UpdateSubject(ctx context.Context, tenantID, id uuid.UUID, code, name string) (domain.Subject, error)
	GetSubjectByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Subject, error)
	ListSubjects(ctx context.Context, tenantID uuid.UUID, search string, page Page) ([]domain.Subject, int64, error)
	SoftDeleteSubject(ctx context.Context, tenantID, id uuid.UUID) error
	CountOfferingsForSubject(ctx context.Context, tenantID, id uuid.UUID) (int64, error)
	CountTeachingAssignmentsForSubject(ctx context.Context, tenantID, id uuid.UUID) (int64, error)

	CreateSubjectOffering(ctx context.Context, o domain.SubjectOffering) (domain.SubjectOffering, error)
	UpdateSubjectOffering(ctx context.Context, tenantID, id uuid.UUID, gradeLevelID *uuid.UUID, hoursPerWeek int16) (domain.SubjectOffering, error)
	GetSubjectOfferingByID(ctx context.Context, tenantID, id uuid.UUID) (domain.SubjectOffering, error)
	ListSubjectOfferings(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.SubjectOffering, error)
	DeleteSubjectOffering(ctx context.Context, tenantID, id uuid.UUID) error

	CreateRoom(ctx context.Context, tenantID uuid.UUID, code, name string, capacity *int32) (domain.Room, error)
	UpdateRoom(ctx context.Context, tenantID, id uuid.UUID, code, name string, capacity *int32) (domain.Room, error)
	GetRoomByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Room, error)
	ListRooms(ctx context.Context, tenantID uuid.UUID, search string, page Page) ([]domain.Room, int64, error)
	SoftDeleteRoom(ctx context.Context, tenantID, id uuid.UUID) error
	CountClassesForRoom(ctx context.Context, tenantID, id uuid.UUID) (int64, error)
}

func (s *Service) ListSubjects(ctx context.Context, tenantID uuid.UUID, search string, page Page) ([]domain.Subject, int64, error) {
	page = normalizePage(page)
	var (
		subjects []domain.Subject
		total    int64
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		subjects, total, err = s.repo.ListSubjects(ctx, tenantID, search, page)
		return err
	})
	return subjects, total, err
}

func (s *Service) CreateSubject(ctx context.Context, tenantID uuid.UUID, code, name string) (domain.Subject, error) {
	if err := validateSubjectFields(code, name); err != nil {
		return domain.Subject{}, err
	}
	var subject domain.Subject
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		subject, err = s.repo.CreateSubject(ctx, tenantID, code, name)
		return mapCheckViolation(mapUniqueViolation(err, domain.ErrSubjectCodeExists), domain.ErrFieldTooLong)
	})
	return subject, err
}

func (s *Service) UpdateSubject(ctx context.Context, tenantID, id uuid.UUID, code, name string) (domain.Subject, error) {
	if err := validateSubjectFields(code, name); err != nil {
		return domain.Subject{}, err
	}
	var subject domain.Subject
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		subject, err = s.repo.UpdateSubject(ctx, tenantID, id, code, name)
		return mapNotFound(mapCheckViolation(mapUniqueViolation(err, domain.ErrSubjectCodeExists), domain.ErrFieldTooLong), domain.ErrSubjectNotFound)
	})
	return subject, err
}

func validateSubjectFields(code, name string) error {
	if err := domain.ValidateMaxLength(code, domain.MaxSubjectCodeLength); err != nil {
		return err
	}
	return domain.ValidateMaxLength(name, domain.MaxSubjectNameLength)
}

// DeleteSubject refuses to remove a subject still referenced by an
// offering or teaching assignment (409 ACADEMIC_HAS_DEPENDENTS).
func (s *Service) DeleteSubject(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		offerings, err := s.repo.CountOfferingsForSubject(ctx, tenantID, id)
		if err != nil {
			return err
		}
		assignments, err := s.repo.CountTeachingAssignmentsForSubject(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if offerings > 0 || assignments > 0 {
			return domain.ErrHasDependents
		}
		return s.repo.SoftDeleteSubject(ctx, tenantID, id)
	})
}

func (s *Service) ListSubjectOfferings(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.SubjectOffering, error) {
	var offerings []domain.SubjectOffering
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		offerings, err = s.repo.ListSubjectOfferings(ctx, tenantID, yearID)
		return err
	})
	return offerings, err
}

func (s *Service) CreateSubjectOffering(ctx context.Context, o domain.SubjectOffering) (domain.SubjectOffering, error) {
	var offering domain.SubjectOffering
	err := s.withTx(ctx, o.TenantID, func(ctx context.Context) error {
		var err error
		offering, err = s.repo.CreateSubjectOffering(ctx, o)
		return mapUniqueViolation(err, domain.ErrSubjectOfferingExists)
	})
	return offering, err
}

func (s *Service) UpdateSubjectOffering(ctx context.Context, tenantID, id uuid.UUID, gradeLevelID *uuid.UUID, hoursPerWeek int16) (domain.SubjectOffering, error) {
	var offering domain.SubjectOffering
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		offering, err = s.repo.UpdateSubjectOffering(ctx, tenantID, id, gradeLevelID, hoursPerWeek)
		return mapNotFound(err, domain.ErrSubjectNotFound)
	})
	return offering, err
}

func (s *Service) DeleteSubjectOffering(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteSubjectOffering(ctx, tenantID, id)
	})
}

func (s *Service) ListRooms(ctx context.Context, tenantID uuid.UUID, search string, page Page) ([]domain.Room, int64, error) {
	page = normalizePage(page)
	var (
		rooms []domain.Room
		total int64
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		rooms, total, err = s.repo.ListRooms(ctx, tenantID, search, page)
		return err
	})
	return rooms, total, err
}

func (s *Service) CreateRoom(ctx context.Context, tenantID uuid.UUID, code, name string, capacity *int32) (domain.Room, error) {
	if err := validateRoomFields(code, name); err != nil {
		return domain.Room{}, err
	}
	var room domain.Room
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		room, err = s.repo.CreateRoom(ctx, tenantID, code, name, capacity)
		return mapCheckViolation(mapUniqueViolation(err, domain.ErrRoomCodeExists), domain.ErrFieldTooLong)
	})
	return room, err
}

func (s *Service) UpdateRoom(ctx context.Context, tenantID, id uuid.UUID, code, name string, capacity *int32) (domain.Room, error) {
	if err := validateRoomFields(code, name); err != nil {
		return domain.Room{}, err
	}
	var room domain.Room
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		room, err = s.repo.UpdateRoom(ctx, tenantID, id, code, name, capacity)
		return mapNotFound(mapCheckViolation(mapUniqueViolation(err, domain.ErrRoomCodeExists), domain.ErrFieldTooLong), domain.ErrRoomNotFound)
	})
	return room, err
}

func validateRoomFields(code, name string) error {
	if err := domain.ValidateMaxLength(code, domain.MaxRoomCodeLength); err != nil {
		return err
	}
	return domain.ValidateMaxLength(name, domain.MaxRoomNameLength)
}

// DeleteRoom refuses to remove a room still assigned to a class (409
// ACADEMIC_HAS_DEPENDENTS).
func (s *Service) DeleteRoom(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		count, err := s.repo.CountClassesForRoom(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if count > 0 {
			return domain.ErrHasDependents
		}
		return s.repo.SoftDeleteRoom(ctx, tenantID, id)
	})
}
