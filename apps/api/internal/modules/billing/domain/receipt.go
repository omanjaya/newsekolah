package domain

// DefaultReceiptNumberingTemplate is used until a tenant configures its
// own document numbering under tenant_policies (kind
// document_numbering), following the same {{seq}}/{{month_roman}}/{{year}}
// convention permits and discipline already use for letters.
const DefaultReceiptNumberingTemplate = "{{seq}}/KWT/{{month_roman}}/{{year}}"

// ReceiptLabel is how a payment method reads on a printed receipt, in
// Indonesian like the rest of the receipt; an unknown code is printed
// as stored rather than dropped.
func (m PaymentMethod) ReceiptLabel() string {
	switch m {
	case PaymentCash:
		return "Tunai"
	case PaymentBankTransfer:
		return "Transfer bank"
	case PaymentOther:
		return "Lainnya"
	}
	return string(m)
}
