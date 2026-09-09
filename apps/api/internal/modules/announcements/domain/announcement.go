// Package domain holds the announcements module's entities and rules:
// who an announcement is addressed to and which status transitions are
// legal. Persistence and delivery live elsewhere.
package domain

import (
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusDraft     Status = "draft"
	StatusScheduled Status = "scheduled"
	StatusPublished Status = "published"
	StatusArchived  Status = "archived"
)

// AudienceType selects which of the Audience lists is meaningful.
type AudienceType string

const (
	AudienceAll     AudienceType = "all"
	AudienceRoles   AudienceType = "roles"
	AudienceClasses AudienceType = "classes"
	AudienceUsers   AudienceType = "users"
)

// Audience is stored as jsonb on the row so an announcement keeps the
// targeting it was published with even if classes are reorganised later.
type Audience struct {
	Type      AudienceType `json:"type"`
	RoleSlugs []string     `json:"role_slugs,omitempty"`
	ClassIDs  []uuid.UUID  `json:"class_ids,omitempty"`
	UserIDs   []uuid.UUID  `json:"user_ids,omitempty"`
}

// Validate rejects a type whose matching list is empty (or a list that
// does not match the type), so the resolver never has to guess.
func (a Audience) Validate() error {
	switch a.Type {
	case AudienceAll:
		return nil
	case AudienceRoles:
		if len(a.RoleSlugs) == 0 {
			return ErrInvalidAudience
		}
	case AudienceClasses:
		if len(a.ClassIDs) == 0 {
			return ErrInvalidAudience
		}
	case AudienceUsers:
		if len(a.UserIDs) == 0 {
			return ErrInvalidAudience
		}
	default:
		return ErrInvalidAudience
	}
	return nil
}

type Announcement struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	SenderUserID   uuid.UUID
	Title          string
	BodyHTML       string
	BodyText       string
	Audience       Audience
	IsPinned       bool
	Status         Status
	StartsAt       *time.Time
	EndsAt         *time.Time
	PublishedAt    *time.Time
	RecipientCount int
	CreatedAt      time.Time
}

// Editable reports whether content changes are still allowed: once
// published, the text readers already saw must not silently change.
func (a Announcement) Editable() bool {
	return a.Status == StatusDraft || a.Status == StatusScheduled
}

const (
	MaxTitleLength = 180
	MaxBodyLength  = 20000
)
