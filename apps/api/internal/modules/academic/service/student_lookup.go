package service

import (
	"context"

	"github.com/google/uuid"
)

// StudentSummary is the minimal student identity this module ever needs to
// show or match against -- name and username come from the identity
// module's users table (read-only; see queries/students_lookup.sql).
type StudentSummary struct {
	ID       uuid.UUID
	Name     string
	Username string
}

// studentLookupRepository reads users/user_profiles/student_profiles
// (owned by the identity module) read-only: matching a student by NIS or
// username for enrollment assignment and Excel import, and listing
// students with no active enrollment this year. This module writes none of
// those tables.
type studentLookupRepository interface {
	FindStudentByUsername(ctx context.Context, tenantID uuid.UUID, username string) (StudentSummary, error)
	FindStudentByNIS(ctx context.Context, tenantID uuid.UUID, nis string) (StudentSummary, error)
	ListUnassignedStudents(ctx context.Context, tenantID, yearID uuid.UUID, search string, page Page) ([]StudentSummary, int64, error)
}

// resolveStudent matches an import row's identifier by NIS first (more
// specific and stable across name changes), then username, per the scope's
// "matching students by NIS or username".
func (s *Service) resolveStudent(ctx context.Context, tenantID uuid.UUID, nis, username string) (StudentSummary, bool) {
	if nis != "" {
		if student, err := s.repo.FindStudentByNIS(ctx, tenantID, nis); err == nil {
			return student, true
		}
	}
	if username != "" {
		if student, err := s.repo.FindStudentByUsername(ctx, tenantID, username); err == nil {
			return student, true
		}
	}
	return StudentSummary{}, false
}
