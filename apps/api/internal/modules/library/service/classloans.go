package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// ClassLoanPair is one student matched to one copy of the class's textbook
// title.
type ClassLoanPair struct {
	StudentUserID uuid.UUID
	StudentName   string
	TitleID       uuid.UUID
	CopyID        uuid.UUID
	Barcode       string
}

// ClassLoanRejected is one student the auto-pairing could not include.
type ClassLoanRejected struct {
	StudentUserID uuid.UUID
	StudentName   string
	Reason        string
}

// ClassLoanPreview is PreviewClassLoans' result: the pairing a librarian
// reviews before committing it.
type ClassLoanPreview struct {
	Pairs    []ClassLoanPair
	Rejected []ClassLoanRejected
}

// PreviewClassLoans pairs a class roster (ordered by name) against one
// title's available copies (ordered by barcode), the old app's auto mode
// (library_circulation_v2.go:241-250): student i gets copy i. A student
// with no member profile, one that is not active, or one who already has
// the title on loan is rejected instead of paired; running out of copies
// before the roster does rejects the rest as "no copy available". The
// active-loan quota is bypassed entirely for class loans, same as the old
// app ("melewati kuota").
func (s *Service) PreviewClassLoans(ctx context.Context, tenantID, classID, titleID uuid.UUID) (ClassLoanPreview, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return ClassLoanPreview{}, err
	}
	roster, err := s.repo.ListClassRoster(ctx, tenantID, classID)
	if err != nil {
		return ClassLoanPreview{}, err
	}
	copies, err := s.repo.ListCopiesForTitle(ctx, tenantID, titleID)
	if err != nil {
		return ClassLoanPreview{}, err
	}
	available := make([]domain.Copy, 0, len(copies))
	for _, c := range copies {
		if c.Status == domain.CopyAvailable {
			available = append(available, c)
		}
	}

	out := ClassLoanPreview{}
	copyIdx := 0
	for _, student := range roster {
		if reason, skip := s.classLoanRejectReason(ctx, tenantID, titleID, student.UserID); skip {
			out.Rejected = append(out.Rejected, ClassLoanRejected{StudentUserID: student.UserID, StudentName: student.UserName, Reason: reason})
			continue
		}
		if copyIdx >= len(available) {
			out.Rejected = append(out.Rejected, ClassLoanRejected{StudentUserID: student.UserID, StudentName: student.UserName, Reason: "no copy available"})
			continue
		}
		cp := available[copyIdx]
		copyIdx++
		out.Pairs = append(out.Pairs, ClassLoanPair{
			StudentUserID: student.UserID, StudentName: student.UserName, TitleID: titleID, CopyID: cp.ID, Barcode: cp.Barcode,
		})
	}
	return out, nil
}

func (s *Service) classLoanRejectReason(ctx context.Context, tenantID, titleID, studentID uuid.UUID) (string, bool) {
	member, found, err := s.repo.GetMember(ctx, tenantID, studentID)
	if err == nil && found && member.Status != domain.MemberActive && member.Status != domain.MemberPending {
		return "member is " + string(member.Status), true
	}
	hasLoan, err := s.repo.HasActiveLoanForMemberAndTitle(ctx, tenantID, titleID, studentID)
	if err == nil && hasLoan {
		return "already has this title", true
	}
	return "", false
}

// CommitClassLoans issues the confirmed pairs (from PreviewClassLoans, or
// from a scan-mode client that built pairs itself) as ordinary loans,
// channel desk, in one transaction. It reuses the same borrow eligibility
// chain as Borrow except the quota check, so a suspended or expired
// member is still rejected even in class-loan mode.
func (s *Service) CommitClassLoans(ctx context.Context, tenantID uuid.UUID, pairs []ClassLoanPair, checkedOutBy uuid.UUID) (BatchBorrowResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return BatchBorrowResult{}, err
	}
	var result BatchBorrowResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := s.clock.Now()
		for _, pair := range pairs {
			loan, err := s.borrowOneWithQuota(ctx, tenantID, BorrowInput{
				Barcode: pair.Barcode, MemberUserID: pair.StudentUserID, CheckedOutBy: checkedOutBy, Channel: domain.ChannelDesk,
			}, now, false)
			if err != nil {
				result.Rejected = append(result.Rejected, RejectedBarcode{Barcode: pair.Barcode, Reason: err.Error()})
				continue
			}
			result.Loans = append(result.Loans, loan)
		}
		return nil
	})
	return result, err
}

// ClassReturns returns every roster student's active loan of titleID
// (old app: library_circulation_v2.go:488-621), applying the normal return
// logic (late working days, fine/suspend/warning, reservation hand-off)
// per loan.
func (s *Service) ClassReturns(ctx context.Context, tenantID, classID, titleID, checkedInBy uuid.UUID) (BatchBorrowResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return BatchBorrowResult{}, err
	}
	roster, err := s.repo.ListClassRoster(ctx, tenantID, classID)
	if err != nil {
		return BatchBorrowResult{}, err
	}
	var result BatchBorrowResult
	for _, student := range roster {
		loans, err := s.repo.ListLoansForMember(ctx, tenantID, student.UserID, false, 50, 0)
		if err != nil {
			return result, err
		}
		var active *domain.Loan
		for i := range loans {
			if loans[i].TitleID == titleID && loans[i].Status == domain.LoanActive {
				active = &loans[i]
				break
			}
		}
		if active == nil {
			continue
		}
		loan, err := s.Return(ctx, tenantID, ReturnInput{LoanID: uuid.NullUUID{UUID: active.ID, Valid: true}, CheckedInBy: checkedInBy})
		if err != nil {
			result.Rejected = append(result.Rejected, RejectedBarcode{Barcode: student.UserName, Reason: err.Error()})
			continue
		}
		result.Loans = append(result.Loans, loan)
	}
	return result, nil
}
