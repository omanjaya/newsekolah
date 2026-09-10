package authz

const (
	PermViewBilling      = "view_billing"
	PermManageFeeTypes   = "manage_fee_types"
	PermGenerateBills    = "generate_bills"
	PermRecordPayments   = "record_payments"
	PermVoidPayments     = "void_payments"
	PermViewChildBilling = "view_child_billing"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewBilling, "billing", "See fee types, bills, payments and the arrears report"},
		Permission{PermManageFeeTypes, "billing", "Create, edit and retire fee types and per-student discounts"},
		Permission{PermGenerateBills, "billing", "Generate bills for a period"},
		Permission{PermRecordPayments, "billing", "Record a payment against a bill and print its receipt"},
		Permission{PermVoidPayments, "billing", "Void a recorded payment"},
		Permission{PermViewChildBilling, "billing", "See a linked child's bills and payment history"},
	)
}
