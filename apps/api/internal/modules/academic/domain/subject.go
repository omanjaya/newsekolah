package domain

import "github.com/google/uuid"

type Subject struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Code     string
	Name     string
}

type SubjectOffering struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	SubjectID      uuid.UUID
	GradeLevelID   *uuid.UUID
	HoursPerWeek   int16
}

type Room struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Code     string
	Name     string
	Capacity *int32
}
