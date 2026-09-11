package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// LoanDueReminderEvent is published once per member per reminder run, even
// when the member has several loans due -- the old app's dedupe was "satu
// per user per hari"; running this job once a day achieves the same
// outcome without a separate dedupe table.
type LoanDueReminderEvent struct {
	TenantID     uuid.UUID
	MemberUserID uuid.UUID
	LoanCount    int
}

func (LoanDueReminderEvent) EventName() string { return "library.loan_due_reminder" }

// SendDueReminders is the daily reminder job's body for one tenant: every
// active loan due within the policy's due_reminder_days gets folded into
// one reminder event per member (old app: reminders/send,
// library_circulation.go:1998-2090 daily 07:00 job).
func (s *Service) SendDueReminders(ctx context.Context, tenantID uuid.UUID) (int, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return 0, err
	}
	policy, err := s.loadPolicy(ctx, tenantID)
	if err != nil {
		return 0, err
	}
	now := s.clock.Now()
	due, err := s.repo.ListLoansDueForReminder(ctx, tenantID, now, now.AddDate(0, 0, policy.DueReminderDays))
	if err != nil {
		return 0, err
	}
	counts := make(map[uuid.UUID]int)
	order := make([]uuid.UUID, 0)
	for _, loan := range due {
		if _, seen := counts[loan.MemberUserID]; !seen {
			order = append(order, loan.MemberUserID)
		}
		counts[loan.MemberUserID]++
	}
	for _, memberID := range order {
		if err := s.publish(ctx, LoanDueReminderEvent{TenantID: tenantID, MemberUserID: memberID, LoanCount: counts[memberID]}); err != nil {
			return len(order), err
		}
	}
	return len(order), nil
}

// SendDueRemindersAllTenants runs SendDueReminders for every active tenant
// whose local time has just passed 07:00, for the periodic River job.
func (s *Service) SendDueRemindersAllTenants(ctx context.Context) (int, error) {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return 0, err
	}
	total := 0
	for _, t := range tenants {
		loc, err := time.LoadLocation(t.Timezone)
		if err != nil {
			loc = time.UTC
		}
		if s.clock.Now().In(loc).Hour() != 7 {
			continue
		}
		n, err := s.SendDueReminders(ctx, t.ID)
		if errors.Is(err, domain.ErrModuleDisabled) {
			continue
		}
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}
