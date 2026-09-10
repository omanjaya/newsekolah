package http

import (
	"bytes"
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *SchedulingHandler) ListJournals(ctx context.Context, request api.ListJournalsRequestObject) (api.ListJournalsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	params := request.Params

	var classID uuid.NullUUID
	teacherID := uuid.NullUUID{UUID: userID, Valid: true}
	if params.ClassId != nil {
		if !h.canViewJournalsAll(ctx, tenantID, userID) {
			return nil, httpx.ErrForbidden
		}
		classID = uuid.NullUUID{UUID: *params.ClassId, Valid: true}
		teacherID = uuid.NullUUID{}
	}

	journals, err := h.service.ListJournals(ctx, tenantID, params.AcademicYearId, teacherID, classID)
	if err != nil {
		return nil, mapJournalError(err)
	}

	data := make([]api.Journal, len(journals))
	for i, j := range journals {
		data[i] = toAPIJournal(j)
	}
	return api.ListJournals200JSONResponse{Data: data}, nil
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
	j, err := h.service.GetJournal(ctx, tenantID, request.JournalId)
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

func (h *SchedulingHandler) ExportJournals(ctx context.Context, request api.ExportJournalsRequestObject) (api.ExportJournalsResponseObject, error) {
	if request.Params.Format == api.ExportJournalsParamsFormatDocx {
		return nil, httpx.NewError(http.StatusNotImplemented, "NOT_IMPLEMENTED")
	}

	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	params := request.Params

	var classID uuid.NullUUID
	teacherID := uuid.NullUUID{UUID: userID, Valid: true}
	if params.ClassId != nil {
		if !h.canViewJournalsAll(ctx, tenantID, userID) {
			return nil, httpx.ErrForbidden
		}
		classID = uuid.NullUUID{UUID: *params.ClassId, Valid: true}
		teacherID = uuid.NullUUID{}
	}

	journals, err := h.service.ListJournals(ctx, tenantID, params.AcademicYearId, teacherID, classID)
	if err != nil {
		return nil, mapJournalError(err)
	}

	buf, err := journalsToXLSX(journals)
	if err != nil {
		return nil, httpx.ErrInternal
	}

	return api.ExportJournals200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body:          bytes.NewReader(buf.Bytes()),
		ContentLength: int64(buf.Len()),
	}, nil
}

// journalsToXLSX renders one sheet, one row per journal, in a fixed
// column order a school office can open directly in Excel/LibreOffice.
// It has no notion of class/subject/teacher display names -- those live
// in the academic module -- so it exports raw IDs alongside the lesson
// content, the same shape the old system's export used before names were
// joined in client-side.
func journalsToXLSX(journals []domain.Journal) (*bytes.Buffer, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	const sheet = "Journals"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, err
	}

	headers := []string{
		"Lesson Date", "Class ID", "Subject ID", "Teacher User ID", "Written By User ID",
		"Topic", "Activities", "Reflection",
	}
	for col, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		_ = f.SetCellValue(sheet, cell, header)
	}

	for i, j := range journals {
		row := i + 2
		values := []any{
			j.LessonDate.Format("2006-01-02"), j.ClassID.String(), j.SubjectID.String(),
			j.TeacherUserID.String(), j.WrittenByUserID.String(), j.Topic, j.Activities, j.Reflection,
		}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf, nil
}
