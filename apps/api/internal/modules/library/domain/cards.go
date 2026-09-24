package domain

// Member card sheet geometry: A4, a 2-column by 5-row grid of ATM-sized
// (85.6x54mm, ISO/IEC 7810 ID-1) membership cards, evenly margined so the
// columns and rows are centered on the page (old app: library_cards.go's
// libraryCardsPDF, ported here so both the single-card and bulk-card print
// paths share one layout).
const (
	CardCols        = 2
	CardRows        = 5
	CardWidthMM     = 85.6
	CardHeightMM    = 54.0
	CardsPerPage    = CardCols * CardRows
	CardMaxPerPrint = 500

	pageWidthMM  = 210.0
	pageHeightMM = 297.0
)

// CardPosition returns the top-left corner, in mm, of the card at
// indexInPage (0-based, already taken modulo CardsPerPage by the caller)
// on the grid described above.
func CardPosition(indexInPage int) (x, y float64) {
	marginX := (pageWidthMM - float64(CardCols)*CardWidthMM) / float64(CardCols+1)
	marginY := (pageHeightMM - float64(CardRows)*CardHeightMM) / float64(CardRows+1)
	col := indexInPage % CardCols
	row := indexInPage / CardCols
	x = marginX + float64(col)*(CardWidthMM+marginX)
	y = marginY + float64(row)*(CardHeightMM+marginY)
	return x, y
}
