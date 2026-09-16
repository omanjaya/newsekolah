package domain

import (
	"time"

	"github.com/google/uuid"
)

type Class struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	AcademicYearID    uuid.UUID
	GradeLevelID      uuid.UUID
	TrackID           *uuid.UUID
	Name              string
	RoomID            *uuid.UUID
	Capacity          *int32
	HomeroomTeacherID *uuid.UUID
}

const (
	EnrollmentStatusActive    = "active"
	EnrollmentStatusMoved     = "moved"
	EnrollmentStatusGraduated = "graduated"
	EnrollmentStatusLeft      = "left"
)

type Enrollment struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	StudentUserID  uuid.UUID
	ClassID        uuid.UUID
	Status         string
	JoinedOn       time.Time
	LeftOn         *time.Time
	// StudentName and StudentNIS are filled by the roster read only, so a
	// class list can name its students without a lookup per row.
	StudentName string
	StudentNIS  string
}
