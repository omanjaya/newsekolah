package domain

import "github.com/google/uuid"

type TeachingAssignment struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	TeacherUserID  uuid.UUID
	SubjectID      uuid.UUID
	ClassID        uuid.UUID
	IsActive       bool
}
