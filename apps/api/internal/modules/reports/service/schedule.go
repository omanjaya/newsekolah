package service

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// downloadLinkTTL is how long a scheduled export's emailed link stays
// valid; long enough that a recipient checking mail the next morning can
// still use it, short enough that a leaked email does not leave the file
// open forever.
const downloadLinkTTL = 7 * 24 * time.Hour

// ScheduleRepository is the schedule feature's data-access boundary. The
// concrete implementation lives in repository/ and is backed by sqlc.
type ScheduleRepository interface {
	CreateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error)
	UpdateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error)
	GetSchedule(ctx context.Context, tenantID, id uuid.UUID) (domain.Schedule, bool, error)
	ListSchedules(ctx context.Context, tenantID uuid.UUID) ([]domain.Schedule, error)
	DeleteSchedule(ctx context.Context, tenantID, id uuid.UUID) error
	SetEnabled(ctx context.Context, tenantID, id uuid.UUID, enabled bool) (domain.Schedule, error)

	ListEnabledSchedulesForTenantHour(ctx context.Context, tenantID uuid.UUID, hour int) ([]domain.Schedule, error)
	ClaimRun(ctx context.Context, tenantID, scheduleID uuid.UUID, dueAt time.Time) (domain.Run, bool, error)
	CompleteRun(ctx context.Context, tenantID, runID uuid.UUID, status domain.RunStatus, errMsg, objectKey string, ranAt time.Time) error
	ListRuns(ctx context.Context, tenantID, scheduleID uuid.UUID, limit int) ([]domain.Run, error)

	ListActiveTenants(ctx context.Context) ([]TenantRef, error)
	TenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error)
}

// TenantRef is the minimal tenant identity the hourly job loops over.
type TenantRef struct {
	ID       uuid.UUID
	Timezone string
}

// SchedulePermissionChecker resolves a user's effective permissions, so
// the service can refuse to create or edit a schedule for a report kind
// the requester could not run interactively -- a schedule must never
// widen anyone's access.
type SchedulePermissionChecker interface {
	EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (authz.Set, error)
}

// RecipientChecker confirms an email belongs to a user of the tenant.
// Implemented by identity's service; reports never reads the users table
// directly (docs/03-layered-architecture.md section 1: no module writes,
// or in this case reads, another module's tables).
type RecipientChecker interface {
	EmailExists(ctx context.Context, tenantID uuid.UUID, email string) (bool, error)
}

// ScheduleStorage is the narrow slice of platform/storage.Client the
// schedule feature needs: write the rendered workbook, then hand back a
// link a recipient can use without an account.
type ScheduleStorage interface {
	PutObject(ctx context.Context, objectKey string, content []byte, contentType string) error
	PresignedGetURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error)
}

// ScheduleInput is what a caller supplies to create or update a schedule;
// ID, TenantID, CreatedBy, timestamps and Enabled are the service's own to
// set.
type ScheduleInput struct {
	ReportKind string
	Params     domain.Params
	Cadence    domain.Cadence
	Weekday    *int
	DayOfMonth *int
	Hour       int
	Recipients []string
}

// PendingNotification is one due, successfully rendered and uploaded
// schedule run awaiting an email send. The transport/jobs worker performs
// the actual send (platform/notify is deliberately out of this package,
// same reasoning as the notifications module) and reports back with
// FinalizeRun so a failed send is recorded, not just a failed render.
type PendingNotification struct {
	RunID       uuid.UUID
	TenantID    uuid.UUID
	ScheduleID  uuid.UUID
	ReportKind  string
	Recipients  []string
	DownloadURL string
	objectKey   string
}

// ScheduleService owns the report_schedules CRUD and the hourly due-run
// scan. It holds the catalogue Service so it can validate a report kind
// exists, check the permission it requires, and render it -- the same
// rules an interactive export follows.
type ScheduleService struct {
	pool    *pgxpool.Pool
	repo    ScheduleRepository
	reports *Service
	perms   SchedulePermissionChecker
	emails  RecipientChecker
	storage ScheduleStorage
	clock   clock.Clock
}

func NewScheduleService(
	pool *pgxpool.Pool,
	repo ScheduleRepository,
	reports *Service,
	perms SchedulePermissionChecker,
	emails RecipientChecker,
	storage ScheduleStorage,
	clk clock.Clock,
) *ScheduleService {
	return &ScheduleService{pool: pool, repo: repo, reports: reports, perms: perms, emails: emails, storage: storage, clock: clk}
}

func (s *ScheduleService) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// authorize confirms kind exists and the requester's effective permissions
// include whatever it requires -- the same check ExportReport performs, so
// a schedule can never run something its owner could not run by hand.
func (s *ScheduleService) authorize(ctx context.Context, tenantID, requestedBy uuid.UUID, kind string) error {
	def, ok := Find(Kind(kind))
	if !ok {
		return domain.ErrReportKindNotFound
	}
	if s.perms == nil {
		return domain.ErrReportKindNotAllowed
	}
	granted, err := s.perms.EffectivePermissions(ctx, tenantID, requestedBy)
	if err != nil {
		return fmt.Errorf("resolve requester permissions: %w", err)
	}
	if !granted.Has(def.Permission) {
		return domain.ErrReportKindNotAllowed
	}
	return nil
}

// checkRecipients confirms every address belongs to a user of tenantID.
func (s *ScheduleService) checkRecipients(ctx context.Context, tenantID uuid.UUID, recipients []string) error {
	if s.emails == nil {
		return nil
	}
	for _, email := range recipients {
		ok, err := s.emails.EmailExists(ctx, tenantID, email)
		if err != nil {
			return fmt.Errorf("check recipient %s: %w", email, err)
		}
		if !ok {
			return fmt.Errorf("%w: %s", domain.ErrRecipientNotTenantUser, email)
		}
	}
	return nil
}

// CreateSchedule validates the report kind, the requester's permission for
// it, and every recipient, before persisting.
func (s *ScheduleService) CreateSchedule(ctx context.Context, tenantID, requestedBy uuid.UUID, in ScheduleInput) (domain.Schedule, error) {
	sched := domain.Schedule{
		TenantID: tenantID, ReportKind: in.ReportKind, Params: in.Params, Cadence: in.Cadence,
		Weekday: in.Weekday, DayOfMonth: in.DayOfMonth, Hour: in.Hour, Recipients: in.Recipients,
		Enabled: true, CreatedBy: requestedBy,
	}
	if err := sched.Validate(); err != nil {
		return domain.Schedule{}, err
	}
	if err := s.authorize(ctx, tenantID, requestedBy, in.ReportKind); err != nil {
		return domain.Schedule{}, err
	}
	if err := s.checkRecipients(ctx, tenantID, in.Recipients); err != nil {
		return domain.Schedule{}, err
	}

	var out domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.CreateSchedule(ctx, sched)
		return err
	})
	return out, err
}

// UpdateSchedule re-validates everything CreateSchedule does: editing a
// schedule to point at a report kind or recipient the requester could not
// otherwise reach must be refused the same way creating it would be.
func (s *ScheduleService) UpdateSchedule(ctx context.Context, tenantID, requestedBy, id uuid.UUID, in ScheduleInput) (domain.Schedule, error) {
	sched := domain.Schedule{
		ID: id, TenantID: tenantID, ReportKind: in.ReportKind, Params: in.Params, Cadence: in.Cadence,
		Weekday: in.Weekday, DayOfMonth: in.DayOfMonth, Hour: in.Hour, Recipients: in.Recipients,
	}
	if err := sched.Validate(); err != nil {
		return domain.Schedule{}, err
	}
	if err := s.authorize(ctx, tenantID, requestedBy, in.ReportKind); err != nil {
		return domain.Schedule{}, err
	}
	if err := s.checkRecipients(ctx, tenantID, in.Recipients); err != nil {
		return domain.Schedule{}, err
	}

	var out domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.UpdateSchedule(ctx, sched)
		return err
	})
	return out, err
}

func (s *ScheduleService) GetSchedule(ctx context.Context, tenantID, id uuid.UUID) (domain.Schedule, error) {
	var sched domain.Schedule
	var ok bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		sched, ok, err = s.repo.GetSchedule(ctx, tenantID, id)
		return err
	})
	if err != nil {
		return domain.Schedule{}, err
	}
	if !ok {
		return domain.Schedule{}, domain.ErrScheduleNotFound
	}
	return sched, nil
}

func (s *ScheduleService) ListSchedules(ctx context.Context, tenantID uuid.UUID) ([]domain.Schedule, error) {
	var scheds []domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		scheds, err = s.repo.ListSchedules(ctx, tenantID)
		return err
	})
	return scheds, err
}

// ScheduleView pairs a schedule with its next due instant, computed once
// per call against the tenant's timezone rather than once per row.
type ScheduleView struct {
	domain.Schedule
	NextRunAt time.Time
}

func (s *ScheduleService) ListSchedulesWithNextRun(ctx context.Context, tenantID uuid.UUID) ([]ScheduleView, error) {
	var scheds []domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		scheds, err = s.repo.ListSchedules(ctx, tenantID)
		return err
	})
	if err != nil {
		return nil, err
	}
	loc := s.tenantLocation(ctx, tenantID)
	now := s.clock.Now()
	out := make([]ScheduleView, len(scheds))
	for i, sched := range scheds {
		out[i] = ScheduleView{Schedule: sched, NextRunAt: sched.NextRunAfter(now, loc)}
	}
	return out, nil
}

func (s *ScheduleService) DeleteSchedule(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteSchedule(ctx, tenantID, id)
	})
}

func (s *ScheduleService) SetEnabled(ctx context.Context, tenantID, id uuid.UUID, enabled bool) (domain.Schedule, error) {
	var out domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.SetEnabled(ctx, tenantID, id, enabled)
		return err
	})
	return out, err
}

func (s *ScheduleService) ListRuns(ctx context.Context, tenantID, scheduleID uuid.UUID, limit int) ([]domain.Run, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var runs []domain.Run
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		runs, err = s.repo.ListRuns(ctx, tenantID, scheduleID, limit)
		return err
	})
	return runs, err
}

// NextRunAt is the schedule's next due instant, for the UI's "next run"
// column; it needs the tenant's timezone, which the caller (transport)
// does not otherwise have a reason to look up.
func (s *ScheduleService) NextRunAt(ctx context.Context, tenantID uuid.UUID, sched domain.Schedule) time.Time {
	loc := s.tenantLocation(ctx, tenantID)
	return sched.NextRunAfter(s.clock.Now(), loc)
}

func (s *ScheduleService) tenantLocation(ctx context.Context, tenantID uuid.UUID) *time.Location {
	tz, err := s.repo.TenantTimezone(ctx, tenantID)
	if err != nil || tz == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return loc
}
