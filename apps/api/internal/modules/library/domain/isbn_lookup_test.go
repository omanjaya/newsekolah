package domain

import "testing"

func TestMapOpenLibraryJSON(t *testing.T) {
	data := []byte(`{
		"ISBN:9786020000000": {
			"title": "Laskar Pelangi",
			"subtitle": "Novel",
			"authors": [{"name": "Andrea Hirata"}, {"name": "Editor Kedua"}],
			"publishers": [{"name": "Bentang Pustaka"}],
			"publish_places": [{"name": "Yogyakarta"}],
			"publish_date": "2005",
			"number_of_pages": 529,
			"subjects": [{"name": "Fiksi"}, {"name": "Pendidikan"}],
			"cover": {"small": "http://covers/s.jpg", "medium": "http://covers/m.jpg", "large": "http://covers/l.jpg"}
		}
	}`)
	bib, ok := MapOpenLibraryJSON(data, "9786020000000")
	if !ok {
		t.Fatal("expected a match")
	}
	if bib.Title != "Laskar Pelangi" {
		t.Errorf("Title = %q, want Laskar Pelangi", bib.Title)
	}
	if bib.MainAuthor != "Andrea Hirata" {
		t.Errorf("MainAuthor = %q, want Andrea Hirata", bib.MainAuthor)
	}
	if bib.AdditionalAuthors != "Editor Kedua" {
		t.Errorf("AdditionalAuthors = %q, want Editor Kedua", bib.AdditionalAuthors)
	}
	if bib.PublishYear != 2005 {
		t.Errorf("PublishYear = %d, want 2005", bib.PublishYear)
	}
	if bib.Pages != "529 hlm." {
		t.Errorf("Pages = %q, want '529 hlm.'", bib.Pages)
	}
	if bib.CoverImageURL != "http://covers/l.jpg" {
		t.Errorf("CoverImageURL = %q, want the large cover", bib.CoverImageURL)
	}
	if bib.Subjects != "Fiksi, Pendidikan" {
		t.Errorf("Subjects = %q, want 'Fiksi, Pendidikan'", bib.Subjects)
	}
}

func TestMapOpenLibraryJSON_NoMatch(t *testing.T) {
	if _, ok := MapOpenLibraryJSON([]byte(`{}`), "9786020000000"); ok {
		t.Error("expected no match on an empty response")
	}
	if _, ok := MapOpenLibraryJSON([]byte(`not json`), "9786020000000"); ok {
		t.Error("expected no match on invalid JSON")
	}
}

func TestMapGoogleBooksJSON(t *testing.T) {
	data := []byte(`{
		"items": [{
			"volumeInfo": {
				"title": "Bumi Manusia",
				"authors": ["Pramoedya Ananta Toer"],
				"publisher": "Hasta Mitra",
				"publishedDate": "1980-08-01",
				"pageCount": 535,
				"categories": ["Fiction"],
				"language": "id",
				"description": "Novel sejarah.",
				"industryIdentifiers": [
					{"type": "ISBN_10", "identifier": "9794610429"},
					{"type": "ISBN_13", "identifier": "9789794610429"}
				],
				"imageLinks": {"thumbnail": "http://books.google.com/thumb.jpg"}
			}
		}]
	}`)
	bib, ok := MapGoogleBooksJSON(data)
	if !ok {
		t.Fatal("expected a match")
	}
	if bib.Title != "Bumi Manusia" {
		t.Errorf("Title = %q, want Bumi Manusia", bib.Title)
	}
	if bib.ISBN != "9789794610429" {
		t.Errorf("ISBN = %q, want the ISBN_13 identifier", bib.ISBN)
	}
	if bib.CoverImageURL != "https://books.google.com/thumb.jpg" {
		t.Errorf("CoverImageURL = %q, want an https URL", bib.CoverImageURL)
	}
	if bib.PublishYear != 1980 {
		t.Errorf("PublishYear = %d, want 1980", bib.PublishYear)
	}
}

func TestMapGoogleBooksJSON_NoItems(t *testing.T) {
	if _, ok := MapGoogleBooksJSON([]byte(`{"items": []}`)); ok {
		t.Error("expected no match with an empty items list")
	}
}

func TestYearFromString(t *testing.T) {
	cases := map[string]int{
		"2005":       2005,
		"May 2005":   2005,
		"2005-04-01": 2005,
		"":           0,
		"no year":    0,
	}
	for in, want := range cases {
		if got := yearFromString(in); got != want {
			t.Errorf("yearFromString(%q) = %d, want %d", in, got, want)
		}
	}
}
