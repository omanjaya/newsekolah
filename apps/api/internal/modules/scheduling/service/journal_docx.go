package service

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"strings"

	"github.com/google/uuid"
)

// ExportJournalsDOCX uses the same scope and row limit as the spreadsheet export.
// The archive contains native Word paragraphs and a repeating-header table.
func (s *Service) ExportJournalsDOCX(ctx context.Context, tenantID, academicYearID uuid.UUID, filter JournalFilter) ([]byte, error) {
	rows, err := s.journalExportRows(ctx, tenantID, academicYearID, filter)
	if err != nil {
		return nil, err
	}
	return renderJournalDOCX(rows)
}

func renderJournalDOCX(rows [][]string) ([]byte, error) {
	var doc strings.Builder
	doc.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`)
	doc.WriteString(journalWordParagraph("Jurnal Mengajar", true))
	doc.WriteString(`<w:tbl><w:tblPr><w:tblW w:w="15000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>`)
	headers := []string{"Tanggal", "Kelas", "Mata Pelajaran", "Guru", "Ditulis Oleh", "Topik", "Kegiatan", "Refleksi"}
	writeRow := func(values []string, header bool) {
		doc.WriteString(`<w:tr>`)
		if header {
			doc.WriteString(`<w:trPr><w:tblHeader/></w:trPr>`)
		}
		for _, value := range values {
			doc.WriteString(`<w:tc><w:tcPr><w:tcW w:w="1875" w:type="dxa"/></w:tcPr>`)
			doc.WriteString(journalWordParagraph(value, header))
			doc.WriteString(`</w:tc>`)
		}
		doc.WriteString(`</w:tr>`)
	}
	writeRow(headers, true)
	for _, row := range rows {
		writeRow(row, false)
	}
	doc.WriteString(`</w:tbl><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`)
	var out bytes.Buffer
	archive := zip.NewWriter(&out)
	parts := []struct{ name, content string }{
		{"[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`},
		{"_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`},
		{"word/document.xml", doc.String()},
	}
	for _, part := range parts {
		file, err := archive.Create(part.name)
		if err != nil {
			return nil, err
		}
		if _, err := file.Write([]byte(part.content)); err != nil {
			return nil, err
		}
	}
	if err := archive.Close(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func journalWordParagraph(text string, bold bool) string {
	var out strings.Builder
	out.WriteString(`<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/>`)
	if bold {
		out.WriteString(`<w:b/>`)
	}
	out.WriteString(`</w:rPr>`)
	for i, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if i > 0 {
			out.WriteString(`<w:br/>`)
		}
		out.WriteString(`<w:t xml:space="preserve">`)
		_ = xml.EscapeText(&out, []byte(line))
		out.WriteString(`</w:t>`)
	}
	out.WriteString(`</w:r></w:p>`)
	return out.String()
}
