package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	academicservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplinedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	gradingdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

var violationSeeds = []struct {
	code, name, category string
	points               int
}{
	{"TL01", "Terlambat masuk sekolah", "kedisiplinan", 5},
	{"SR01", "Seragam tidak lengkap", "kedisiplinan", 5},
	{"BL01", "Tidak mengerjakan tugas", "akademik", 10},
	{"RK01", "Merokok di lingkungan sekolah", "berat", 50},
}

var componentSeeds = []struct {
	code, description string
	kind              gradingdomain.ComponentKind
	weight            float64
}{
	{"TG1", "Tugas harian 1", gradingdomain.KindFormative, 1},
	{"UH1", "Ulangan harian 1", gradingdomain.KindFormative, 2},
	{"PTS", "Penilaian tengah semester", gradingdomain.KindSummative, 3},
}

// seedPhase2 adds the data the discipline and grading modules need to be
// usable in a demo: an active term, a violation catalogue, one assessment
// component set for the demo class, and the parent-student link.
func seedPhase2(ctx context.Context, pool *pgxpool.Pool, q *db.Queries, tenantID, yearID uuid.UUID, users map[string]db.User, encryptionSecret string, logger *slog.Logger) error {
	academicSvc := academic.Register(pool, clock.Real{}).Service
	termID, err := ensureTerm(ctx, academicSvc, tenantID, yearID)
	if err != nil {
		return err
	}

	sealer, err := crypto.NewSealer("v1", encryptionSecret)
	if err != nil {
		return fmt.Errorf("seed sealer: %w", err)
	}
	schoolModule := school.Register(pool, tenant.ModeSingle)
	disciplineModule := discipline.Register(discipline.Dependencies{Pool: pool, Years: schoolModule.Service, Sealer: sealer, Clock: clock.Real{}})
	if err := ensureViolationTypes(ctx, disciplineModule, tenantID); err != nil {
		return err
	}

	class, err := findClass(ctx, academicSvc, tenantID, yearID, demoClassName)
	if err != nil {
		return err
	}
	subjects, err := ensureSubjects(ctx, academicSvc, tenantID)
	if err != nil {
		return err
	}
	gradingModule := grading.Register(grading.Dependencies{Pool: pool, Years: schoolModule.Service, Clock: clock.Real{}})
	if err := ensureComponents(ctx, gradingModule, tenantID, users["guru"].ID, class.ID, subjects[demoSubjectCode].ID, termID); err != nil {
		return err
	}

	if err := ensureParentLink(ctx, q, tenantID, users["ortu"].ID, users["siswa"].ID); err != nil {
		return err
	}
	logger.Info("phase 2 data ready", "term", termID, "violation_types", len(violationSeeds), "components", len(componentSeeds))
	return nil
}

func ensureTerm(ctx context.Context, svc *academicservice.Service, tenantID, yearID uuid.UUID) (uuid.UUID, error) {
	terms, err := svc.ListTerms(ctx, tenantID, yearID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("list terms: %w", err)
	}
	for _, t := range terms {
		if t.IsActive {
			return t.ID, nil
		}
	}
	if len(terms) == 0 {
		term, err := svc.CreateTerm(ctx, tenantID, yearID, "Semester 1", 1,
			time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC), time.Date(2026, 12, 20, 0, 0, 0, 0, time.UTC))
		if err != nil {
			return uuid.Nil, fmt.Errorf("create term: %w", err)
		}
		terms = append(terms, term)
	}
	if err := svc.ActivateTerm(ctx, tenantID, terms[0].ID); err != nil {
		return uuid.Nil, fmt.Errorf("activate term: %w", err)
	}
	return terms[0].ID, nil
}

func ensureViolationTypes(ctx context.Context, module *discipline.Module, tenantID uuid.UUID) error {
	existing, err := module.Service.ListViolationTypes(ctx, tenantID, true, "")
	if err != nil {
		return fmt.Errorf("list violation types: %w", err)
	}
	have := make(map[string]bool, len(existing))
	for _, t := range existing {
		have[t.Code] = true
	}
	for _, seed := range violationSeeds {
		if have[seed.code] {
			continue
		}
		if _, err := module.Service.CreateViolationType(ctx, disciplinedomain.ViolationType{
			TenantID: tenantID, Code: seed.code, Name: seed.name, Points: seed.points, Category: seed.category,
		}); err != nil {
			return fmt.Errorf("create violation type %s: %w", seed.code, err)
		}
	}
	return nil
}

func ensureComponents(ctx context.Context, module *grading.Module, tenantID, teacherID, classID, subjectID, termID uuid.UUID) error {
	book, err := module.Service.Gradebook(ctx, tenantID, gradingservice.GradebookQuery{
		ClassID: classID, SubjectID: subjectID, TermID: uuid.NullUUID{UUID: termID, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("read gradebook: %w", err)
	}
	have := make(map[string]bool, len(book.Components))
	for _, c := range book.Components {
		have[c.Code] = true
	}
	for i, seed := range componentSeeds {
		if have[seed.code] {
			continue
		}
		if _, err := module.Service.CreateComponent(ctx, tenantID, teacherID, true, gradingservice.ComponentInput{
			ClassID: classID, SubjectID: subjectID, TermID: uuid.NullUUID{UUID: termID, Valid: true},
			Code: seed.code, Kind: seed.kind, Description: seed.description, Weight: seed.weight, Sequence: i + 1,
		}); err != nil {
			return fmt.Errorf("create component %s: %w", seed.code, err)
		}
	}
	return nil
}

func ensureParentLink(ctx context.Context, q *db.Queries, tenantID, parentID, studentID uuid.UUID) error {
	if parentID == uuid.Nil || studentID == uuid.Nil {
		return nil
	}
	if _, err := q.LinkParentStudent(ctx, db.LinkParentStudentParams{
		ParentUserID: parentID, StudentUserID: studentID, TenantID: tenantID, Relation: "guardian", CanApproveLeave: true,
	}); err != nil {
		return fmt.Errorf("link parent to student: %w", err)
	}
	return nil
}
