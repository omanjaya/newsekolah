package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

// ListTPMappings returns the TP export mappings of every component in one
// class-subject-term, the scope the e-Rapor legacy export reads
// (grading_extended.go:154-186's listTPMappings).
func (s *Service) ListTPMappings(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID, subjectID uuid.UUID, termID uuid.NullUUID) ([]domain.TPMapping, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.TPMapping
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		term, err := s.resolveTerm(ctx, tenantID, yearID, termID)
		if err != nil {
			return err
		}
		if err := s.requireTeaches(ctx, tenantID, yearID, actorID, classID, subjectID, canManageAny); err != nil {
			return err
		}
		componentIDs, err := s.componentIDsInScope(ctx, tenantID, term.ID, classID, subjectID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListTPMappingsForComponents(ctx, tenantID, componentIDs)
		return err
	})
	return out, err
}

type TPMappingInput struct {
	ComponentID uuid.UUID
	ExportCode  string
	RMin        float64
	RMax        float64
	TMin        float64
	TMax        float64
}

// SaveTPMapping creates or replaces one component's export mapping
// (grading_extended.go:188-246's saveTPMappings, one row at a time
// instead of a whole-scope replace, since a mapping is 1:1 with its
// component). Only formative components, or the tenant's configured TP
// kind, may be mapped; the export code must be unique among the sibling
// components of the same class, subject and term.
func (s *Service) SaveTPMapping(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, in TPMappingInput) (domain.TPMapping, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.TPMapping{}, err
	}
	var out domain.TPMapping
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		component, ok, err := s.repo.GetComponent(ctx, tenantID, in.ComponentID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrComponentNotFound
		}
		if err := s.requireTeaches(ctx, tenantID, component.AcademicYearID, actorID, component.ClassID, component.SubjectID, canManageAny); err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		if !scale.IsTPEligible(component.Kind) {
			return domain.ErrTPKindNotEligible
		}
		mapping := domain.TPMapping{
			ComponentID: in.ComponentID, ExportCode: strings.ToUpper(strings.TrimSpace(in.ExportCode)),
			RMin: in.RMin, RMax: in.RMax, TMin: in.TMin, TMax: in.TMax,
		}
		if err := domain.ValidateTPMapping(scale, mapping); err != nil {
			return err
		}
		if err := s.checkTPExportCodeUnique(ctx, tenantID, component, mapping.ExportCode); err != nil {
			return err
		}
		out, err = s.repo.UpsertTPMapping(ctx, tenantID, mapping)
		return err
	})
	return out, err
}

// checkTPExportCodeUnique refuses a code already used by a sibling
// component's mapping in the same class, subject and term
// (grading_extended.go:221's "seen[x.ExportCode]", generalized from one
// save batch to the whole scope since mappings are now saved one at a
// time).
func (s *Service) checkTPExportCodeUnique(ctx context.Context, tenantID uuid.UUID, component domain.Component, code string) error {
	siblingIDs, err := s.componentIDsInScope(ctx, tenantID, component.TermID, component.ClassID, component.SubjectID)
	if err != nil {
		return err
	}
	existing, err := s.repo.ListTPMappingsForComponents(ctx, tenantID, siblingIDs)
	if err != nil {
		return err
	}
	for _, m := range existing {
		if m.ComponentID != component.ID && m.ExportCode == code {
			return domain.ErrTPExportCodeExists
		}
	}
	return nil
}

func (s *Service) componentIDsInScope(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) ([]uuid.UUID, error) {
	components, err := s.repo.ListComponents(ctx, tenantID, termID, classID, subjectID)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, len(components))
	for i, c := range components {
		ids[i] = c.ID
	}
	return ids, nil
}

// DeleteTPMapping removes one component's export mapping.
func (s *Service) DeleteTPMapping(ctx context.Context, tenantID, actorID, id uuid.UUID, canManageAny bool) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		mapping, ok, err := s.repo.GetTPMapping(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrTPMappingNotFound
		}
		component, ok, err := s.repo.GetComponent(ctx, tenantID, mapping.ComponentID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrComponentNotFound
		}
		if err := s.requireTeaches(ctx, tenantID, component.AcademicYearID, actorID, component.ClassID, component.SubjectID, canManageAny); err != nil {
			return err
		}
		return s.repo.DeleteTPMapping(ctx, tenantID, id)
	})
}
