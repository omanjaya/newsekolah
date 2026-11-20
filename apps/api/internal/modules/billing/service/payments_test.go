package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
)

// TestReceiptVarsAreFormattedForReaders pins the receipt that printed
// "SPP Bulanan2026-11100000" and "bank_transfer": the template gets the
// amount in rupiah, the month by name and the method in Indonesian.
func TestReceiptVarsAreFormattedForReaders(t *testing.T) {
	display := StudentDisplay{StudentName: "Siswa Contoh", ClassName: "X-A", GuardianName: "Orang Tua"}
	payment := domain.Payment{
		AmountMinor: 100000, Method: domain.PaymentBankTransfer, Reference: "TRF-001",
		PaidOn: time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC),
	}

	monthly := receiptVars(display, domain.Bill{FeeTypeName: "SPP Bulanan", Period: "2026-11", Currency: "IDR"}, payment)
	require.Equal(t, "Rp 100.000", monthly["amount"])
	require.Equal(t, "November 2026", monthly["period"])
	require.Equal(t, "Transfer bank", monthly["method"])
	require.Equal(t, "20 November 2026", monthly["paid_on"])
	require.Equal(t, "SPP Bulanan", monthly["fee_type_name"])

	oneOff := receiptVars(display, domain.Bill{FeeTypeName: "Class meeting", Period: "2026-classmeeting", Currency: "IDR"}, payment)
	require.Equal(t, "2026-classmeeting", oneOff["period"], "a one-off period prints as the admin typed it")

	require.Equal(t, "Tunai", domain.PaymentCash.ReceiptLabel())
	require.Equal(t, "Lainnya", domain.PaymentOther.ReceiptLabel())
	require.Equal(t, "USD 1.500", receiptAmount("USD", 1500))
}
