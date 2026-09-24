package domain

import (
	"math"
	"testing"
)

func TestCardPosition(t *testing.T) {
	const marginX = (pageWidthMM - CardCols*CardWidthMM) / (CardCols + 1)
	const marginY = (pageHeightMM - CardRows*CardHeightMM) / (CardRows + 1)

	cases := []struct {
		index int
		wantX float64
		wantY float64
	}{
		{0, marginX, marginY},
		{1, marginX + CardWidthMM + marginX, marginY},
		{2, marginX, marginY + CardHeightMM + marginY},
		{9, marginX + CardWidthMM + marginX, marginY + 4*(CardHeightMM+marginY)},
	}
	for _, c := range cases {
		x, y := CardPosition(c.index)
		if math.Abs(x-c.wantX) > 1e-9 || math.Abs(y-c.wantY) > 1e-9 {
			t.Errorf("CardPosition(%d) = (%v, %v), want (%v, %v)", c.index, x, y, c.wantX, c.wantY)
		}
	}
}

func TestCardsPerPageFillsAnA4Page(t *testing.T) {
	if CardsPerPage != CardCols*CardRows {
		t.Fatalf("CardsPerPage = %d, want %d", CardsPerPage, CardCols*CardRows)
	}
	if CardCols*CardWidthMM >= pageWidthMM {
		t.Fatalf("cards do not fit the page width: %v >= %v", CardCols*CardWidthMM, pageWidthMM)
	}
	if CardRows*CardHeightMM >= pageHeightMM {
		t.Fatalf("cards do not fit the page height: %v >= %v", CardRows*CardHeightMM, pageHeightMM)
	}
}
