package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// journalExportRowLimit caps a single export: large enough for any one
// school's journal history, small enough to keep the request bounded
// rather than paging through an unbounded ListJournals result.
const journalExportRowLimit = 5000

// ExportJournalsXLSX renders every journal matching filter (ignoring
// filter.Limit/Offset) as a single-sheet workbook with resolved
// class/subject/teacher/writer names, replacing the old export's raw IDs
// (docs/analysis/backend-inventory.md section 1.12) with the names a
// school office actually needs to read the file.
func (s *Service) ExportJournalsXLSX(ctx context.Context, tenantID, academicYearID uuid.UUID, filter JournalFilter) ([]byte, error) {
	rows, err := s.journalExportRows(ctx, tenantID, academicYearID, filter)
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	const sheet = "Journals"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, err
	}

	headers := []string{"Lesson Date", "Class", "Subject", "Teacher", "Written By", "Topic", "Activities", "Reflection"}
	for col, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
	}

	for i, values := range rows {
		row := i + 2
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// journalExportRows resolves names inside the tenant transaction so RLS also
// applies to class, subject and user lookups rather than returning raw IDs.
func (s *Service) journalExportRows(ctx context.Context, tenantID, academicYearID uuid.UUID, filter JournalFilter) ([][]string, error) {
	filter.Limit, filter.Offset = journalExportRowLimit, 0
	var rows [][]string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		journals, err := s.repo.ListJournalsFiltered(ctx, tenantID, academicYearID, filter)
		if err != nil {
			return err
		}
		names := journalNameResolver{ctx: ctx, tenantID: tenantID, repo: s.repo, classes: map[uuid.UUID]string{}, subjects: map[uuid.UUID]string{}, users: map[uuid.UUID]string{}}
		for _, j := range journals {
			rows = append(rows, []string{j.LessonDate.Format("2006-01-02"), names.class(j.ClassID), names.subject(j.SubjectID), names.user(j.TeacherUserID), names.user(j.WrittenByUserID), j.Topic, j.Activities, j.Reflection})
		}
		return nil
	})
	return rows, err
}

// journalNameResolver memoizes class/subject/user name lookups across one
// export so a class or teacher shared by many rows is only fetched once.
// A lookup failure falls back to the raw ID rather than failing the whole
// export over one stale reference.
type journalNameResolver struct {
	ctx      context.Context
	tenantID uuid.UUID
	repo     Repository
	classes  map[uuid.UUID]string
	subjects map[uuid.UUID]string
	users    map[uuid.UUID]string
}

func (n journalNameResolver) class(id uuid.UUID) string {
	if name, ok := n.classes[id]; ok {
		return name
	}
	name := id.String()
	if ref, err := n.repo.GetClassRef(n.ctx, n.tenantID, id); err == nil {
		name = ref.Name
	}
	n.classes[id] = name
	return name
}

func (n journalNameResolver) subject(id uuid.UUID) string {
	if name, ok := n.subjects[id]; ok {
		return name
	}
	name := id.String()
	if ref, err := n.repo.GetSubjectRef(n.ctx, n.tenantID, id); err == nil {
		name = ref.Name
	}
	n.subjects[id] = name
	return name
}

func (n journalNameResolver) user(id uuid.UUID) string {
	if name, ok := n.users[id]; ok {
		return name
	}
	name := id.String()
	if resolved, err := n.repo.GetUserName(n.ctx, n.tenantID, id); err == nil && resolved != "" {
		name = resolved
	}
	n.users[id] = name
	return name
}
