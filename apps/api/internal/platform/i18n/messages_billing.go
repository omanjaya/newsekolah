package i18n

func init() {
	catalog["BILLING_MODULE_DISABLED"] = map[string]string{Indonesian: "Modul pembayaran SPP belum diaktifkan untuk sekolah ini.", English: "The billing module is not enabled for this school."}
	catalog["FEE_TYPE_NOT_FOUND"] = map[string]string{Indonesian: "Jenis biaya tidak ditemukan.", English: "Fee type not found."}
	catalog["DISCOUNT_NOT_FOUND"] = map[string]string{Indonesian: "Potongan tidak ditemukan.", English: "Discount not found."}
	catalog["BILL_NOT_FOUND"] = map[string]string{Indonesian: "Tagihan tidak ditemukan.", English: "Bill not found."}
	catalog["BILL_ALREADY_PAID"] = map[string]string{Indonesian: "Tagihan ini sudah lunas.", English: "This bill is already fully paid."}
	catalog["PAYMENT_NOT_FOUND"] = map[string]string{Indonesian: "Pembayaran tidak ditemukan.", English: "Payment not found."}
	catalog["PAYMENT_ALREADY_VOIDED"] = map[string]string{Indonesian: "Pembayaran ini sudah dibatalkan.", English: "This payment was already voided."}
	catalog["PAYMENT_EXCEEDS_OUTSTANDING"] = map[string]string{Indonesian: "Jumlah pembayaran melebihi sisa tagihan.", English: "The payment amount exceeds the bill's outstanding balance."}
}
