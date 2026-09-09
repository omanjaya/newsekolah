package service

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// ExportTenantArgs is the River job payload for one tenant export run.
type ExportTenantArgs struct {
	TenantID uuid.UUID
	ExportID uuid.UUID
}

func (ExportTenantArgs) Kind() string { return "platform.export_tenant" }

const exportDownloadTTL = 15 * time.Minute

// ExportView is what the console shows for one export: its status, and a
// time-limited download link once it is done.
type ExportView struct {
	domain.Export
	DownloadURL string
}

// RequestExport enqueues a background job that writes the tenant's core
// tables (users, academic years, classes) as CSV inside one ZIP and stores
// it in object storage, mirroring how the reports module builds and
// stores a spreadsheet export.
func (s *Service) RequestExport(ctx context.Context, tenantID uuid.UUID) (domain.Export, error) {
	if err := s.guard(); err != nil {
		return domain.Export{}, err
	}
	if s.storage == nil {
		return domain.Export{}, domain.ErrStorageDisabled
	}
	if _, ok, err := s.repo.GetTenant(ctx, tenantID); err != nil {
		return domain.Export{}, err
	} else if !ok {
		return domain.Export{}, domain.ErrTenantNotFound
	}

	var export domain.Export
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		export, err = s.repo.CreateExport(ctx, tenantID)
		if err != nil {
			return err
		}
		tx, ok := txFromContext(ctx)
		if !ok {
			return fmt.Errorf("request export: no transaction bound to context")
		}
		_, err = s.jobs.InsertTx(ctx, tx, ExportTenantArgs{TenantID: tenantID, ExportID: export.ID}, nil)
		return err
	})
	return export, err
}

// GetExport reports one export's status and, once it is done, a
// time-limited download URL.
func (s *Service) GetExport(ctx context.Context, tenantID, exportID uuid.UUID) (ExportView, error) {
	if err := s.guard(); err != nil {
		return ExportView{}, err
	}
	var (
		export domain.Export
		found  bool
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		export, found, err = s.repo.GetExport(ctx, tenantID, exportID)
		return err
	})
	if err != nil {
		return ExportView{}, err
	}
	if !found {
		return ExportView{}, domain.ErrExportNotFound
	}

	view := ExportView{Export: export}
	if export.Status == string(domain.ExportDone) && export.ObjectKey != "" && s.storage != nil {
		url, err := s.storage.PresignedGetURL(ctx, export.ObjectKey, exportDownloadTTL)
		if err != nil {
			return ExportView{}, err
		}
		view.DownloadURL = url
	}
	return view, nil
}

// RunExport is the export job's actual work, called by the River worker in
// jobs.go. It deliberately ignores single-tenant mode: a job already
// enqueued must finish or fail regardless of a later config change.
func (s *Service) RunExport(ctx context.Context, tenantID, exportID uuid.UUID) error {
	if s.storage == nil {
		return domain.ErrStorageDisabled
	}

	zipped, err := s.buildExportZIP(ctx, tenantID)
	if err != nil {
		s.failExport(ctx, tenantID, exportID, err)
		return err
	}

	objectKey := fmt.Sprintf("tenants/%s/exports/%s.zip", tenantID, exportID)
	if err := s.storage.PutObject(ctx, objectKey, zipped, "application/zip"); err != nil {
		s.failExport(ctx, tenantID, exportID, err)
		return err
	}

	now := s.clock.Now()
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.UpdateExportStatus(ctx, exportID, domain.ExportDone, objectKey, "", &now)
	})
}

func (s *Service) failExport(ctx context.Context, tenantID, exportID uuid.UUID, cause error) {
	now := s.clock.Now()
	_ = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.UpdateExportStatus(ctx, exportID, domain.ExportFailed, "", cause.Error(), &now)
	})
}

func (s *Service) buildExportZIP(ctx context.Context, tenantID uuid.UUID) ([]byte, error) {
	var users, years, classes [][]string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		if users, err = s.repo.ExportUsersCSV(ctx, tenantID); err != nil {
			return err
		}
		if years, err = s.repo.ExportAcademicYearsCSV(ctx, tenantID); err != nil {
			return err
		}
		classes, err = s.repo.ExportClassesCSV(ctx, tenantID)
		return err
	})
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	files := []struct {
		name string
		rows [][]string
	}{
		{"users.csv", users},
		{"academic_years.csv", years},
		{"classes.csv", classes},
	}
	for _, f := range files {
		if err := writeCSVEntry(zw, f.name, f.rows); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("close export zip: %w", err)
	}
	return buf.Bytes(), nil
}

func writeCSVEntry(zw *zip.Writer, name string, rows [][]string) error {
	w, err := zw.Create(name)
	if err != nil {
		return fmt.Errorf("create %s in zip: %w", name, err)
	}
	cw := csv.NewWriter(w)
	if err := cw.WriteAll(rows); err != nil {
		return fmt.Errorf("write %s: %w", name, err)
	}
	return nil
}
