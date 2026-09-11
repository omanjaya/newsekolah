package domain

import "github.com/google/uuid"

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
