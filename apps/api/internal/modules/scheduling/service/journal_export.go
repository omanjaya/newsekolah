package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
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
	filter.Limit, filter.Offset = journalExportRowLimit, 0

	var journals []domain.Journal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		journals, err = s.repo.ListJournalsFiltered(ctx, tenantID, academicYearID, filter)
		return err
	})
	if err != nil {
		return nil, err
	}

	names := journalNameResolver{ctx: ctx, tenantID: tenantID, repo: s.repo, classes: map[uuid.UUID]string{}, subjects: map[uuid.UUID]string{}, users: map[uuid.UUID]string{}}

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

	for i, j := range journals {
		row := i + 2
		values := []any{
			j.LessonDate.Format("2006-01-02"), names.class(j.ClassID), names.subject(j.SubjectID),
			names.user(j.TeacherUserID), names.user(j.WrittenByUserID), j.Topic, j.Activities, j.Reflection,
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
	return buf.Bytes(), nil
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
