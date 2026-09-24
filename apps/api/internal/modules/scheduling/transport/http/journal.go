package http

import (
	"bytes"
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// journalFilterFrom builds a service.JournalFilter shared by ListJournals
// and ExportJournals: class_id given switches from "my own journals" to
// "every journal for a class", gated by view_journals_all.
func (h *SchedulingHandler) journalFilterFrom(
	ctx context.Context, tenantID, userID uuid.UUID, classID *uuid.UUID, dateFrom, dateTo *time.Time, search *string,
) (service.JournalFilter, error) {
	f := service.JournalFilter{TeacherUserID: uuid.NullUUID{UUID: userID, Valid: true}}
	if classID != nil {
		if !h.canViewJournalsAll(ctx, tenantID, userID) {
			return service.JournalFilter{}, httpx.ErrForbidden
		}
		f.TeacherUserID = uuid.NullUUID{}
		f.ClassID = uuid.NullUUID{UUID: *classID, Valid: true}
	}
	f.DateFrom, f.DateTo = dateFrom, dateTo
	if search != nil {
		f.Search = *search
	}
	return f, nil
}

func (h *SchedulingHandler) ListJournals(ctx context.Context, request api.ListJournalsRequestObject) (api.ListJournalsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	params := request.Params

	var dateFrom, dateTo *time.Time
	if params.DateFrom != nil {
		dateFrom = &params.DateFrom.Time
	}
	if params.DateTo != nil {
		dateTo = &params.DateTo.Time
	}
	f, err := h.journalFilterFrom(ctx, tenantID, userID, params.ClassId, dateFrom, dateTo, params.Search)
	if err != nil {
		return nil, err
	}
	if params.Limit != nil {
		f.Limit = *params.Limit
	}
	if params.Offset != nil {
		f.Offset = *params.Offset
	}

	journals, total, err := h.service.ListJournals(ctx, tenantID, params.AcademicYearId, f)
	if err != nil {
		return nil, mapJournalError(err)
	}

	data := make([]api.Journal, len(journals))
	for i, j := range journals {
		data[i] = toAPIJournal(j)
	}
	return api.ListJournals200JSONResponse{Data: data, Total: int(total)}, nil
}

func toJournalInput(body api.JournalWriteRequest) service.JournalInput {
	in := service.JournalInput{
		AcademicYearID: body.AcademicYearId,
		ClassID:        body.ClassId,
		SubjectID:      body.SubjectId,
		LessonDate:     body.LessonDate.Time,
		Topic:          body.Topic,
		Activities:     body.Activities,
	}
	if body.Reflection != nil {
		in.Reflection = *body.Reflection
	}
	return in
}

func (h *SchedulingHandler) UpsertJournal(ctx context.Context, request api.UpsertJournalRequestObject) (api.UpsertJournalResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	// The writer is always the caller; the schedule's own teacher of
	// record (which may differ, for an accepted substitute) is resolved
	// by AccessChecker in an upstream module once that check is wired --
	// today, only self-service journals are supported, so teacher and
	// writer are the same user.
	out, err := h.service.UpsertJournal(ctx, tenantID, userID, userID, toJournalInput(*request.Body))
	if err != nil {
		return nil, mapJournalError(err)
	}
	return api.UpsertJournal200JSONResponse(toAPIJournal(out)), nil
}

func (h *SchedulingHandler) GetJournal(ctx context.Context, request api.GetJournalRequestObject) (api.GetJournalResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	j, err := h.service.GetJournal(ctx, tenantID, request.JournalId, userID, h.canViewJournalsAll(ctx, tenantID, userID))
	if err != nil {
		return nil, mapJournalError(err)
	}
	return api.GetJournal200JSONResponse(toAPIJournal(j)), nil
}

func (h *SchedulingHandler) DeleteJournal(ctx context.Context, request api.DeleteJournalRequestObject) (api.DeleteJournalResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	if err := h.service.DeleteJournal(ctx, tenantID, request.JournalId, userID); err != nil {
		return nil, mapJournalError(err)
	}
	return api.DeleteJournal204Response{}, nil
}

// ExportJournals renders scoped journal entries as XLSX or DOCX.
func (h *SchedulingHandler) ExportJournals(ctx context.Context, request api.ExportJournalsRequestObject) (api.ExportJournalsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	params := request.Params

	var dateFrom, dateTo *time.Time
	if params.DateFrom != nil {
		dateFrom = &params.DateFrom.Time
	}
	if params.DateTo != nil {
		dateTo = &params.DateTo.Time
	}
	f, err := h.journalFilterFrom(ctx, tenantID, userID, params.ClassId, dateFrom, dateTo, params.Search)
	if err != nil {
		return nil, err
	}

	if params.Format == api.ExportJournalsParamsFormatDocx {
		content, err := h.service.ExportJournalsDOCX(ctx, tenantID, params.AcademicYearId, f)
		if err != nil {
			return nil, mapJournalError(err)
		}
		return api.ExportJournals200ApplicationvndOpenxmlformatsOfficedocumentWordprocessingmlDocumentResponse{
			Body: bytes.NewReader(content), ContentLength: int64(len(content)),
		}, nil
	}

	opts := reportdocOptions(params.Format == api.ExportJournalsParamsFormatPdf, params.Title, params.Letterhead, params.Columns)
	file, err := h.service.ExportJournalsReport(ctx, tenantID, params.AcademicYearId, f, tenantLocale(ctx), opts)
	if err != nil {
		return nil, mapJournalError(err)
	}
	if opts.Format == reportdoc.FormatPDF {
		return api.ExportJournals200ApplicationpdfResponse{
			Body: bytes.NewReader(file), ContentLength: int64(len(file)),
		}, nil
	}
	return api.ExportJournals200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body:          bytes.NewReader(file),
		ContentLength: int64(len(file)),
	}, nil
}
