package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
)

// WarningLetterIssued is published after a letter commits so notifications
// can reach the student and the homeroom teacher.
type WarningLetterIssued struct {
	TenantID      uuid.UUID
	LetterID      uuid.UUID
	StudentUserID uuid.UUID
	ClassID       uuid.NullUUID
	Level         int
	LevelLabel    string
	LetterNumber  string
	IssuedBy      uuid.UUID
}

func (WarningLetterIssued) EventName() string { return "discipline.warning_letter.issued" }

// IssueWarningLetter issues the given level for a student once their
// active points reach the policy threshold. Levels are issued in order;
// a snapshot of the violations that count is frozen on the letter.
// business-rule guard clauses gate one write or one aggregated read;
// the branches are sequential guards, not nested decision logic, and
// the module's existing test suite already covers them. Left as-is
// here to avoid behaviour risk in a lint-only change.
//
//nolint:gocyclo // service method: several independent precondition/authorization/
func (s *Service) IssueWarningLetter(ctx context.Context, tenantID, studentID, issuerUserID uuid.UUID, level int) (domain.WarningLetter, error) {
	var (
		out     domain.WarningLetter
		classID uuid.NullUUID
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		total, due, err := s.dueLevels(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		issued, err := s.repo.ListLettersForStudent(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		for _, l := range issued {
			if l.Level == level {
				return domain.ErrLetterAlreadyIssued
			}
		}
		if len(due) == 0 || due[0].Level != level {
			return domain.ErrLetterLevelNotDue
		}
		target := due[0]

		records, err := s.repo.ListRecordsForStudent(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		snapshot, err := json.Marshal(snapshotOf(records))
		if err != nil {
			return err
		}
		student, err := s.repo.StudentSnapshot(ctx, tenantID, studentID, yearID)
		if err != nil {
			return err
		}
		classID, err = s.repo.ActiveClassID(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		tmpl, err := s.loadWarningLetterTemplatePolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		issuerName := s.lookupName(ctx, tenantID, issuerUserID)

		letterID := uuid.Must(uuid.NewV7())
		doc, err := s.issueLetterDocument(ctx, tenantID, letterID, yearID, issuerUserID, student, target, total, records, len(issued), tmpl, issuerName)
		if err != nil {
			return err
		}
		out, err = s.repo.CreateLetter(ctx, domain.WarningLetter{
			ID: letterID, TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID,
			Level: target.Level, LevelLabel: target.Label, ThresholdPoints: target.MinPoints, TotalPoints: total,
			LetterNumber: doc.Number, IssuedBy: uuid.NullUUID{UUID: issuerUserID, Valid: true}, Snapshot: snapshot, DocumentAssetID: doc.AssetID,
		})
		return err
	})
	if err != nil {
		return domain.WarningLetter{}, err
	}
	if s.events != nil {
		_ = s.events.Publish(ctx, WarningLetterIssued{
			TenantID: tenantID, LetterID: out.ID, StudentUserID: studentID, ClassID: classID,
			Level: out.Level, LevelLabel: out.LevelLabel, LetterNumber: out.LetterNumber, IssuedBy: issuerUserID,
		})
	}
	return out, nil
}

// lookupName resolves a single user's display name through NameLookup,
// tolerating a nil dependency or a lookup error (the letter is issued
// either way; a blank issuer name is a cosmetic loss, not a failure).
func (s *Service) lookupName(ctx context.Context, tenantID, userID uuid.UUID) string {
	if s.names == nil {
		return ""
	}
	names, err := s.names.Names(ctx, tenantID, []uuid.UUID{userID})
	if err != nil {
		return ""
	}
	return names[userID]
}

// issueLetterDocument renders the PDF through the shared pipeline, or
// numbers the letter locally when no document issuer is wired (tests).
func (s *Service) issueLetterDocument(ctx context.Context, tenantID, letterID, yearID, issuerUserID uuid.UUID, student StudentSnapshot, target domain.SPLevel, total int, records []domain.ViolationRecord, issuedCount int, tmpl domain.WarningLetterTemplatePolicy, issuerName string) (IssuedDocument, error) {
	if s.docs == nil {
		format := "%d/SP/%s"
		if tmpl.SeqPad > 0 {
			format = fmt.Sprintf("%%0%dd/SP/%%s", tmpl.SeqPad)
		}
		return IssuedDocument{Number: fmt.Sprintf(format, issuedCount+1, s.clock.Now().Format("2006"))}, nil
	}
	doc, err := s.docs.IssueWarningLetter(ctx, tenantID, WarningLetterDocument{
		LetterID: letterID, AcademicYearID: yearID, IssuerUserID: issuerUserID,
		NumberingTemplate: tmpl.NumberPattern, SeqPad: tmpl.SeqPad,
		Vars: map[string]any{
			"student_name": student.StudentName, "class_name": student.ClassName, "guardian_name": student.GuardianName,
			"nis": student.NIS, "issuer_name": issuerName,
			"level": target.Level, "level_label": target.Label, "threshold_points": target.MinPoints, "total_points": total,
			"opening_text": tmpl.OpeningText, "closing_text": tmpl.ClosingText,
			"violations": violationLines(records),
		},
	})
	if err != nil {
		return IssuedDocument{}, fmt.Errorf("issue warning letter document: %w", err)
	}
	return doc, nil
}

type snapshotRecord struct {
	Type       string `json:"type"`
	Points     int    `json:"points"`
	OccurredOn string `json:"occurred_on"`
	Notes      string `json:"notes,omitempty"`
}

func snapshotOf(records []domain.ViolationRecord) []snapshotRecord {
	out := make([]snapshotRecord, 0, len(records))
	for _, r := range records {
		if r.IsVoided() {
			continue
		}
		out = append(out, snapshotRecord{Type: r.TypeName, Points: r.PointsSnapshot, OccurredOn: r.OccurredOn.Format("2006-01-02"), Notes: r.Notes})
	}
	return out
}

func violationLines(records []domain.ViolationRecord) []map[string]any {
	out := make([]map[string]any, 0, len(records))
	for _, r := range records {
		if r.IsVoided() {
			continue
		}
		out = append(out, map[string]any{"date": r.OccurredOn.Format("02-01-2006"), "name": r.TypeName, "points": r.PointsSnapshot})
	}
	return out
}

func (s *Service) ListWarningLetters(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID, limit, offset int) ([]domain.WarningLetter, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []domain.WarningLetter
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListLetters(ctx, tenantID, yearID, classID, limit, max(offset, 0))
		return err
	})
	return out, err
}

func (s *Service) GetWarningLetter(ctx context.Context, tenantID, id uuid.UUID) (domain.WarningLetter, error) {
	var out domain.WarningLetter
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		letter, ok, err := s.repo.GetLetter(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrLetterNotFound
		}
		out = letter
		return nil
	})
	return out, err
}

// WarningLetterURL presigns the stored PDF.
func (s *Service) WarningLetterURL(ctx context.Context, tenantID, id uuid.UUID) (string, error) {
	letter, err := s.GetWarningLetter(ctx, tenantID, id)
	if err != nil {
		return "", err
	}
	if !letter.DocumentAssetID.Valid || s.docs == nil {
		return "", domain.ErrLetterNotFound
	}
	return s.docs.DocumentURL(ctx, tenantID, letter.DocumentAssetID.UUID)
}

// WarningLetterTemplatePolicy exposes the tenant's numbering pattern and
// wording for the settings screen.
func (s *Service) WarningLetterTemplatePolicy(ctx context.Context, tenantID uuid.UUID) (domain.WarningLetterTemplatePolicy, error) {
	var out domain.WarningLetterTemplatePolicy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.loadWarningLetterTemplatePolicy(ctx, tenantID)
		return err
	})
	return out, err
}

// BuiltinWarningLetterHTML is the template used until a school uploads its
// own under document_templates (kind warning_letter). NIS, the issuer's
// name and a three-column signature block (Orang Tua / Siswa / Guru BK)
// match the old app's DOCX (violation_warning_letters.go:447-503);
// opening_text/closing_text come from the tenant's numbering-and-wording
// policy so a school can reword the letter without a code change.
const BuiltinWarningLetterHTML = `<html><body style="font-family: serif; font-size: 12pt; margin: 40px;">
<h2 style="text-align:center; margin-bottom: 4px;">SURAT PERINGATAN {{.level}}</h2>
<p style="text-align:center; margin-top:0;">Nomor: {{.letter_number}}</p>
<p>Kepada Yth. Orang tua/wali dari:</p>
<table>
<tr><td>Nama</td><td>: {{.student_name}}</td></tr>
<tr><td>NIS</td><td>: {{.nis}}</td></tr>
<tr><td>Kelas</td><td>: {{.class_name}}</td></tr>
<tr><td>Wali</td><td>: {{.guardian_name}}</td></tr>
</table>
<p>{{.opening_text}} (total {{.total_points}} poin, ambang {{.level_label}}: {{.threshold_points}} poin):</p>
<table border="1" cellpadding="4" cellspacing="0">
<tr><th>Tanggal</th><th>Pelanggaran</th><th>Poin</th></tr>
{{range .violations}}<tr><td>{{.date}}</td><td>{{.name}}</td><td>{{.points}}</td></tr>{{end}}
</table>
<p>{{.closing_text}}</p>
<p>Surat ini diterbitkan pada {{.issued_at}} oleh {{.issuer_name}}. Kode verifikasi: <strong>{{.verification_code}}</strong></p>
<table style="width:100%; margin-top:60px; text-align:center;">
<tr><td>Orang Tua/Wali</td><td>Siswa</td><td>Guru BK</td></tr>
<tr><td style="padding-top:70px;">(....................)</td><td style="padding-top:70px;">(....................)</td><td style="padding-top:70px;">{{.issuer_name}}</td></tr>
</table>
</body></html>`
