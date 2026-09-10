package domain

import "github.com/google/uuid"

// ArrearsLine is one student's total outstanding balance across every
// bill that is not fully paid, for the finance office's per-student view.
type ArrearsLine struct {
	StudentUserID    uuid.UUID
	ClassID          uuid.NullUUID
	OutstandingMinor int64
	BillCount        int
}

// ArrearsByStudent sums outstanding balances per student from a set of
// bills, in the order each student's first unpaid bill appears, so the
// report is stable across calls given the same input order.
func ArrearsByStudent(bills []Bill, classOf map[uuid.UUID]uuid.NullUUID) []ArrearsLine {
	order := make([]uuid.UUID, 0, len(bills))
	byStudent := make(map[uuid.UUID]*ArrearsLine, len(bills))
	for _, b := range bills {
		outstanding := b.Outstanding()
		if outstanding <= 0 {
			continue
		}
		line, ok := byStudent[b.StudentUserID]
		if !ok {
			line = &ArrearsLine{StudentUserID: b.StudentUserID, ClassID: classOf[b.StudentUserID]}
			byStudent[b.StudentUserID] = line
			order = append(order, b.StudentUserID)
		}
		line.OutstandingMinor += outstanding
		line.BillCount++
	}
	out := make([]ArrearsLine, len(order))
	for i, id := range order {
		out[i] = *byStudent[id]
	}
	return out
}

// ClassArrears is one class's total outstanding balance across its
// students, for the finance office's per-class view.
type ClassArrears struct {
	ClassID          uuid.NullUUID
	OutstandingMinor int64
	StudentCount     int
}

// ArrearsByClass rolls per-student arrears lines up into per-class
// totals. A student with no active class enrollment (ClassID not valid)
// is grouped together under the zero UUID.
func ArrearsByClass(lines []ArrearsLine) []ClassArrears {
	order := make([]uuid.UUID, 0, len(lines))
	byClass := make(map[uuid.UUID]*ClassArrears, len(lines))
	for _, l := range lines {
		key := uuid.Nil
		if l.ClassID.Valid {
			key = l.ClassID.UUID
		}
		c, ok := byClass[key]
		if !ok {
			c = &ClassArrears{ClassID: l.ClassID}
			byClass[key] = c
			order = append(order, key)
		}
		c.OutstandingMinor += l.OutstandingMinor
		c.StudentCount++
	}
	out := make([]ClassArrears, len(order))
	for i, k := range order {
		out[i] = *byClass[k]
	}
	return out
}
