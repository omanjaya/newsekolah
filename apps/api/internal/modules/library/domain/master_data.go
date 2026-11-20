package domain

import (
	"strings"

	"github.com/google/uuid"
)

// MasterKind names one of the five catalogue master-data tables, for
// error messages and generic handling in the transport layer.
type MasterKind string

const (
	MasterMaterialType       MasterKind = "material_type"
	MasterCollectionCategory MasterKind = "collection_category"
	MasterAcquisitionSource  MasterKind = "acquisition_source"
	MasterPartner            MasterKind = "partner"
	MasterLocation           MasterKind = "location"
)

// MasterEntry is one row of a catalogue master-data table. Only material
// types use MaxLoanItems/MaxLoanDays/MaxRenewals; only partners use
// ContactName/Phone/Address. The other kinds leave those at zero values.
type MasterEntry struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	Code         string
	Name         string
	IsActive     bool
	SortOrder    int
	MaxLoanItems int
	MaxLoanDays  int
	MaxRenewals  int
	ContactName  string
	Phone        string
	Address      string
}

func (e MasterEntry) Validate(kind MasterKind) error {
	if e.Code == "" || e.Name == "" {
		return ErrInvalidInput
	}
	if kind == MasterMaterialType && (e.MaxLoanItems <= 0 || e.MaxLoanDays <= 0 || e.MaxRenewals < 0) {
		return ErrInvalidInput
	}
	return nil
}

// DDCClass is one of the ten fixed top-level Dewey Decimal classes.
type DDCClass struct {
	Code string
	Name string
}

// DDCPrefix turns a catalogue classification filter into the prefix a DDC
// number must start with. A three-digit code names a class, division or
// section, which stands for its whole range, so its trailing zeros are not
// part of the prefix: "800" (Sastra) covers 800-899 and becomes "8", "890"
// becomes "89", "899" stays "899", and "000" becomes "0". A shorter value
// is already a prefix and is kept as given; empty input means no filter.
func DDCPrefix(class string) string {
	class = strings.TrimSpace(class)
	if len(class) != 3 {
		return class
	}
	if trimmed := strings.TrimRight(class, "0"); trimmed != "" {
		return trimmed
	}
	return "0"
}
