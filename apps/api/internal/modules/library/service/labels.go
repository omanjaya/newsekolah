package service

import (
	"bytes"
	"context"
	"fmt"
	"image/png"
	"strings"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
	"github.com/go-pdf/fpdf"
	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// labelBarcodePixelWidth/Height is the Code 128 PNG's raster size before
// fpdf scales it down onto the label (old app: generateLibraryCode128PNG,
// 300x60).
const (
	labelBarcodePixelWidth  = 300
	labelBarcodePixelHeight = 60
)

// generateCode128PNG renders value as a Code 128 barcode PNG. A blank
// value is not encodable, so it falls back to a single space rather than
// failing the whole print job over one copy with no barcode.
func generateCode128PNG(value string) ([]byte, error) {
	if strings.TrimSpace(value) == "" {
		value = " "
	}
	code, err := code128.Encode(value)
	if err != nil {
		return nil, fmt.Errorf("encode code128: %w", err)
	}
	scaled, err := barcode.Scale(code, labelBarcodePixelWidth, labelBarcodePixelHeight)
	if err != nil {
		return nil, fmt.Errorf("scale barcode: %w", err)
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, scaled); err != nil {
		return nil, fmt.Errorf("encode barcode png: %w", err)
	}
	return buf.Bytes(), nil
}

// PrintCopyLabels renders a batch of copies as one A4 PDF of 70x25mm
// spine/barcode labels, 3 columns by 8 rows per page, in the order
// copyIDs was given -- 1 to 500 at a time (old app: library_labels.go's
// POST /labels.pdf). Unlike the shared documents.Renderer (platform
// Package, plain-text letters only) this renders directly with fpdf so
// each label can carry a real Code 128 barcode image at a fixed grid
// position, not just text.
func (s *Service) PrintCopyLabels(ctx context.Context, tenantID uuid.UUID, copyIDs []uuid.UUID) ([]byte, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	if len(copyIDs) == 0 || len(copyIDs) > domain.LabelMaxPerPrint {
		return nil, domain.ErrInvalidInput
	}
	copies, err := s.repo.GetCopiesByIDs(ctx, tenantID, copyIDs)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]domain.Copy, len(copies))
	for _, c := range copies {
		byID[c.ID] = c
	}
	ordered := make([]domain.Copy, 0, len(copyIDs))
	for _, id := range copyIDs {
		if c, found := byID[id]; found {
			ordered = append(ordered, c)
		}
	}
	if len(ordered) == 0 {
		return nil, domain.ErrCopyNotFound
	}

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetFont("Helvetica", "", 8)

	for i, cp := range ordered {
		indexInPage := i % domain.LabelsPerPage
		if indexInPage == 0 {
			pdf.AddPage()
		}
		x, y := domain.LabelPosition(indexInPage)

		lines := domain.LabelCallNumberLines(cp.CallNumber)
		pdf.SetFont("Helvetica", "B", 9)
		const lineHeight = 3.6
		for lineIndex, line := range lines {
			pdf.SetXY(x, y+1+float64(lineIndex)*lineHeight)
			pdf.CellFormat(domain.LabelWidthMM, lineHeight, line, "", 0, "C", false, 0, "")
		}

		barcodeValue := cp.Barcode
		if barcodeValue == "" {
			barcodeValue = cp.AccessionNumber
		}
		if imgBytes, err := generateCode128PNG(barcodeValue); err == nil {
			imageName := fmt.Sprintf("barcode-%d", i)
			pdf.RegisterImageOptionsReader(imageName, fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(imgBytes))
			const barcodeHeight = 10.0
			barcodeWidth := domain.LabelWidthMM - 10
			pdf.ImageOptions(imageName, x+5, y+13, barcodeWidth, barcodeHeight, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
		}
		pdf.SetFont("Helvetica", "", 7)
		pdf.SetXY(x, y+23)
		pdf.CellFormat(domain.LabelWidthMM, 3, barcodeValue, "", 0, "C", false, 0, "")
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("render labels pdf: %w", err)
	}
	return buf.Bytes(), nil
}
