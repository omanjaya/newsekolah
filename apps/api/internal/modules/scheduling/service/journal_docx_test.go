package service

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"strings"
	"testing"
)

func TestJournalDOCXPackageAndEscapedContent(t *testing.T) {
	for _, rows := range [][][]string{nil, {{"18-09-2026", "X A", "Seni & Budaya", "Guru", "Penulis", "<Topik>", "Baris satu\nBaris dua", "Refleksi"}}} {
		data, err := renderJournalDOCX(rows)
		if err != nil {
			t.Fatal(err)
		}
		archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			t.Fatal(err)
		}
		parts := map[string]string{}
		for _, file := range archive.File {
			reader, err := file.Open()
			if err != nil {
				t.Fatal(err)
			}
			content, err := io.ReadAll(reader)
			_ = reader.Close()
			if err != nil {
				t.Fatal(err)
			}
			decoder := xml.NewDecoder(bytes.NewReader(content))
			for {
				_, err := decoder.Token()
				if err == io.EOF {
					break
				}
				if err != nil {
					t.Fatalf("%s: %v", file.Name, err)
				}
			}
			parts[file.Name] = string(content)
		}
		for _, name := range []string{"[Content_Types].xml", "_rels/.rels", "word/document.xml"} {
			if parts[name] == "" {
				t.Errorf("missing part %s", name)
			}
		}
		if !strings.Contains(parts["_rels/.rels"], `Target="word/document.xml"`) {
			t.Fatal("missing document relationship")
		}
		if len(rows) > 0 {
			for _, text := range []string{"Seni &amp; Budaya", "&lt;Topik&gt;", "<w:br/>", "Refleksi"} {
				if !strings.Contains(parts["word/document.xml"], text) {
					t.Errorf("missing %s", text)
				}
			}
		}
	}
}
