package service

import (
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
)

// UserProfileFields is every optional user_profiles/student_profiles/
// teacher_profiles/staff_profiles column an admin can set, in one struct
// shared by create, update, and bulk import so the three code paths do not
// each carry their own copy.
type UserProfileFields struct {
	NIK        string
	Gender     string
	BirthPlace string
	BirthDate  time.Time
	Religion   string
	Address    string
	District   string
	City       string
	BloodType  string

	NIS              string
	NISN             string
	EntryYear        int
	PreviousSchool   string
	FatherName       string
	MotherName       string
	GuardianName     string
	GuardianPhone    string
	ParentOccupation string

	NIP              string
	NUPTK            string
	EmploymentStatus string
	LastEducation    string
	JoinedYear       int
	Specialization   string
	EmployeeNumber   string
	Position         string
}

// UserAdminView is one row of the admin user list/detail response.
type UserAdminView struct {
	ID                 uuid.UUID
	Username           string
	Email              string
	Phone              string
	Name               string
	Status             domain.UserStatus
	ProfileKind        domain.ProfileKind
	Locale             string
	AvatarURL          string
	MustChangePassword bool
	LastLoginAt        time.Time
	CreatedAt          time.Time
	Roles              []domain.Role
	Profile            UserProfileFields
}

type ListUsersFilter struct {
	Search          string
	Status          string
	ProfileKind     string
	RoleSlug        string
	IncludeArchived bool
	Cursor          uuid.UUID
	Limit           int
}

type ListUsersResult struct {
	Items      []UserAdminView
	NextCursor uuid.UUID
}

// UserWriteInput is shared by CreateUser and UpdateUser: everything except
// Username/Password, which create treats differently from update (username
// is immutable after creation; password changes go through the dedicated
// reset-password action, never a plain field update).
type UserWriteInput struct {
	Name        string
	Email       string
	Phone       string
	Locale      string
	ProfileKind domain.ProfileKind
	Profile     UserProfileFields
	Roles       []domain.RoleGrant
}

type CreateUserInput struct {
	UserWriteInput
	Username string // blank => generated from Name
	Password string // blank => a random, never-returned initial password
}

const defaultPageLimit = 25
const maxPageLimit = 100

func clampLimit(limit int) int {
	if limit <= 0 {
		return defaultPageLimit
	}
	if limit > maxPageLimit {
		return maxPageLimit
	}
	return limit
}
