// Package domain holds the platform console's entities and validation
// rules: provisioning a tenant, its module feature flags, and the tenant
// data export a superadmin can request (docs/12-roadmap.md Fase 3).
package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	// ErrTenancyDisabled is returned by every service method when
	// config.TenancyMode is single: a single-school deployment has exactly
	// one tenant and no console to operate on.
	ErrTenancyDisabled = errors.New("platform console disabled in single-tenant mode")
	ErrTenantNotFound  = errors.New("tenant not found")
	ErrSlugTaken       = errors.New("tenant slug already in use")
	ErrDomainTaken     = errors.New("domain already in use")
	ErrInvalidInput    = errors.New("invalid input")
	ErrUnknownModule   = errors.New("unknown module")
	ErrExportNotFound  = errors.New("export not found")
	ErrExportNotReady  = errors.New("export not finished yet")
	ErrStorageDisabled = errors.New("object storage not configured")
)

// slugPattern mirrors the `tenants.slug` check constraint in
// 0001_platform_core.up.sql so a bad slug fails before hitting the database.
var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`)

// hostPattern accepts a bare hostname (labels of letters, digits and
// hyphens separated by dots), matching what `tenants.primary_domain` is
// used for: DNS-level routing, not a full URL.
var hostPattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`)

// ValidHost reports whether host is a plausible custom domain for a
// tenant.
func ValidHost(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	return len(h) <= 253 && hostPattern.MatchString(h)
}

// EducationLevel is one of the school levels the platform serves.
type EducationLevel string

const (
	LevelSD  EducationLevel = "sd"
	LevelSMP EducationLevel = "smp"
	LevelSMA EducationLevel = "sma"
	LevelSMK EducationLevel = "smk"
)

func (l EducationLevel) Valid() bool {
	switch l {
	case LevelSD, LevelSMP, LevelSMA, LevelSMK:
		return true
	}
	return false
}

// TenantStatus mirrors the `tenants.status` values this console can set;
// "trial", "offboarding" and "deleted" are set by other flows.
type TenantStatus string

const (
	StatusActive    TenantStatus = "active"
	StatusSuspended TenantStatus = "suspended"
)

// Module is a feature module a tenant can turn on or off, matching the
// existing `feature_flags.module` values already written by other modules.
type Module string

const (
	ModuleLibrary         Module = "library"
	ModuleDiscipline      Module = "discipline"
	ModuleGrading         Module = "grading"
	ModulePermits         Module = "permits"
	ModuleAnnouncements   Module = "announcements"
	ModuleReports         Module = "reports"
	ModuleActivities      Module = "activities"
	ModuleMentoring       Module = "mentoring"
	ModuleSupervision     Module = "supervision"
	ModuleStaffAttendance Module = "staff_attendance"
	ModuleVisitors        Module = "visitors"
	ModuleBilling         Module = "billing"
)

// AllModules lists every module the console can toggle, in the fixed order
// a tenant detail view renders them. The Fase 6 modules
// (docs/12-roadmap.md) ship behind these flags from day one.
var AllModules = []Module{
	ModuleLibrary, ModuleDiscipline, ModuleGrading, ModulePermits, ModuleAnnouncements, ModuleReports,
	ModuleActivities, ModuleMentoring, ModuleSupervision, ModuleStaffAttendance, ModuleVisitors,
	ModuleBilling,
}

func (m Module) Valid() bool {
	for _, v := range AllModules {
		if v == m {
			return true
		}
	}
	return false
}

// Tenant is one row of the platform-wide `tenants` table.
type Tenant struct {
	ID             uuid.UUID
	Slug           string
	Name           string
	EducationLevel string
	Timezone       string
	Status         string
	PrimaryDomain  string
	CreatedAt      time.Time
}

// TenantHealth adds the at-a-glance operational summary the console list
// shows next to each tenant.
type TenantHealth struct {
	Tenant
	UserCount          int
	ActiveAcademicYear string
	LastActivityAt     *time.Time
	StorageBucket      string
}

// ModuleFlag is one row of `feature_flags` narrowed to what the console
// exposes: whether a module is on for this tenant.
type ModuleFlag struct {
	Module  string
	Enabled bool
}

// TenantInput is the create-tenant form: the tenant's own profile plus its
// first administrator, whose password the caller receives exactly once.
type TenantInput struct {
	Slug           string
	Name           string
	EducationLevel string
	Timezone       string
	AdminUsername  string
	AdminEmail     string
	AdminName      string
}

// Validate enforces the same shape the database schema would otherwise
// reject anyway, so a bad request fails with a translated message instead
// of a raw constraint-violation error.
func (in TenantInput) Validate() error {
	slug := strings.TrimSpace(in.Slug)
	if !slugPattern.MatchString(slug) {
		return ErrInvalidInput
	}
	if strings.TrimSpace(in.Name) == "" || len(in.Name) > 150 {
		return ErrInvalidInput
	}
	if !EducationLevel(in.EducationLevel).Valid() {
		return ErrInvalidInput
	}
	if strings.TrimSpace(in.Timezone) == "" {
		return ErrInvalidInput
	}
	if strings.TrimSpace(in.AdminUsername) == "" || strings.TrimSpace(in.AdminName) == "" {
		return ErrInvalidInput
	}
	return nil
}

// ExportStatus is the lifecycle of one tenant data export job.
type ExportStatus string

const (
	ExportPending ExportStatus = "pending"
	ExportRunning ExportStatus = "running"
	ExportDone    ExportStatus = "done"
	ExportFailed  ExportStatus = "failed"
)

// Export is one row of `tenant_exports`.
type Export struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	Status       string
	ObjectKey    string
	ErrorMessage string
	CreatedAt    time.Time
	CompletedAt  *time.Time
}
