package domain

// DefaultReceiptNumberingTemplate is used until a tenant configures its
// own document numbering under tenant_policies (kind
// document_numbering), following the same {{seq}}/{{month_roman}}/{{year}}
// convention permits and discipline already use for letters.
const DefaultReceiptNumberingTemplate = "{{seq}}/KWT/{{month_roman}}/{{year}}"
