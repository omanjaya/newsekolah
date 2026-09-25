package domain

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

// ExternalBibliography is what an external ISBN lookup contributes toward
// a new title: enough to prefill the catalogue form, not a full
// bibliographic record (old app: libraryISBNBibliography).
type ExternalBibliography struct {
	Title             string
	Subtitle          string
	MainAuthor        string
	AdditionalAuthors string
	Publisher         string
	PublishPlace      string
	PublishYear       int // 0 when unknown
	Pages             string
	ISBN              string
	Subjects          string
	Language          string
	Abstract          string
	CoverImageURL     string
}

var yearPattern = regexp.MustCompile(`\d{4}`)

// yearFromString extracts the first 4-digit run from a free-form date
// string ("2005", "May 2005", "2005-04-01"), the same tolerant parse the
// old app used for both external sources' publish-date fields.
func yearFromString(value string) int {
	match := yearPattern.FindString(value)
	if match == "" {
		return 0
	}
	year, err := strconv.Atoi(match)
	if err != nil {
		return 0
	}
	return year
}

// openLibraryEntry mirrors the fields Open Library's
// /api/books?bibkeys=ISBN:<isbn>&format=json&jscmd=data response carries.
type openLibraryEntry struct {
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Authors  []struct {
		Name string `json:"name"`
	} `json:"authors"`
	Publishers []struct {
		Name string `json:"name"`
	} `json:"publishers"`
	PublishPlaces []struct {
		Name string `json:"name"`
	} `json:"publish_places"`
	PublishDate   string `json:"publish_date"`
	NumberOfPages int    `json:"number_of_pages"`
	Subjects      []struct {
		Name string `json:"name"`
	} `json:"subjects"`
	Cover struct {
		Small  string `json:"small"`
		Medium string `json:"medium"`
		Large  string `json:"large"`
	} `json:"cover"`
}

// MapOpenLibraryJSON turns one Open Library bibkeys response into an
// ExternalBibliography. isbn picks the "ISBN:<isbn>" entry when present;
// otherwise the response's one entry (whatever key it came back under) is
// used. Pure and network-free so it can be unit tested against a fixture.
// business rule against one field, the same shape gocyclo penalizes in
// any exhaustive validator. Splitting per-field checks into helpers
// would only move the branch count elsewhere while making the full
// rule set harder to read in one place.
//
//nolint:gocyclo // field-by-field validation: each branch checks one independent
func MapOpenLibraryJSON(data []byte, isbn string) (ExternalBibliography, bool) {
	var parsed map[string]openLibraryEntry
	if err := json.Unmarshal(data, &parsed); err != nil {
		return ExternalBibliography{}, false
	}
	entry, ok := parsed["ISBN:"+isbn]
	if !ok {
		for _, v := range parsed {
			entry, ok = v, true
			break
		}
	}
	if !ok || strings.TrimSpace(entry.Title) == "" {
		return ExternalBibliography{}, false
	}

	authors := make([]string, 0, len(entry.Authors))
	for _, a := range entry.Authors {
		if name := strings.TrimSpace(a.Name); name != "" {
			authors = append(authors, name)
		}
	}
	mainAuthor, additional := "", ""
	if len(authors) > 0 {
		mainAuthor = authors[0]
	}
	if len(authors) > 1 {
		additional = strings.Join(authors[1:], "; ")
	}
	publisher := ""
	if len(entry.Publishers) > 0 {
		publisher = strings.TrimSpace(entry.Publishers[0].Name)
	}
	place := ""
	if len(entry.PublishPlaces) > 0 {
		place = strings.TrimSpace(entry.PublishPlaces[0].Name)
	}
	subjects := make([]string, 0, len(entry.Subjects))
	for _, subj := range entry.Subjects {
		if name := strings.TrimSpace(subj.Name); name != "" {
			subjects = append(subjects, name)
		}
	}
	pages := ""
	if entry.NumberOfPages > 0 {
		pages = strconv.Itoa(entry.NumberOfPages) + " hlm."
	}
	cover := entry.Cover.Large
	if cover == "" {
		cover = entry.Cover.Medium
	}
	if cover == "" {
		cover = entry.Cover.Small
	}

	bib := ExternalBibliography{
		Title: strings.TrimSpace(entry.Title), Subtitle: strings.TrimSpace(entry.Subtitle), MainAuthor: mainAuthor,
		AdditionalAuthors: additional, Publisher: publisher, PublishPlace: place, PublishYear: yearFromString(entry.PublishDate),
		Pages: pages, ISBN: isbn, Subjects: strings.Join(subjects, ", "), CoverImageURL: cover,
	}
	return bib, true
}

// googleBooksResponse mirrors the fields Google Books'
// /books/v1/volumes?q=isbn:<isbn> response carries.
type googleBooksResponse struct {
	Items []struct {
		VolumeInfo struct {
			Title               string   `json:"title"`
			Subtitle            string   `json:"subtitle"`
			Authors             []string `json:"authors"`
			Publisher           string   `json:"publisher"`
			PublishedDate       string   `json:"publishedDate"`
			PageCount           int      `json:"pageCount"`
			Categories          []string `json:"categories"`
			Language            string   `json:"language"`
			Description         string   `json:"description"`
			IndustryIdentifiers []struct {
				Type       string `json:"type"`
				Identifier string `json:"identifier"`
			} `json:"industryIdentifiers"`
			ImageLinks struct {
				Thumbnail      string `json:"thumbnail"`
				SmallThumbnail string `json:"smallThumbnail"`
			} `json:"imageLinks"`
		} `json:"volumeInfo"`
	} `json:"items"`
}

// MapGoogleBooksJSON turns one Google Books volumes response into an
// ExternalBibliography, preferring the ISBN_13 identifier and upgrading
// an http cover thumbnail to https (old app: libraryMapGoogleBooksJSON).
func MapGoogleBooksJSON(data []byte) (ExternalBibliography, bool) {
	var parsed googleBooksResponse
	if err := json.Unmarshal(data, &parsed); err != nil {
		return ExternalBibliography{}, false
	}
	if len(parsed.Items) == 0 {
		return ExternalBibliography{}, false
	}
	info := parsed.Items[0].VolumeInfo
	if strings.TrimSpace(info.Title) == "" {
		return ExternalBibliography{}, false
	}

	mainAuthor, additional := "", ""
	if len(info.Authors) > 0 {
		mainAuthor = strings.TrimSpace(info.Authors[0])
	}
	if len(info.Authors) > 1 {
		additional = strings.Join(info.Authors[1:], "; ")
	}
	pages := ""
	if info.PageCount > 0 {
		pages = strconv.Itoa(info.PageCount) + " hlm."
	}
	cover := info.ImageLinks.Thumbnail
	if cover == "" {
		cover = info.ImageLinks.SmallThumbnail
	}
	cover = strings.Replace(cover, "http://", "https://", 1)

	isbn := ""
	for _, ident := range info.IndustryIdentifiers {
		if ident.Type == "ISBN_13" {
			isbn = ident.Identifier
			break
		}
	}
	if isbn == "" {
		for _, ident := range info.IndustryIdentifiers {
			if ident.Type == "ISBN_10" {
				isbn = ident.Identifier
				break
			}
		}
	}

	bib := ExternalBibliography{
		Title: strings.TrimSpace(info.Title), Subtitle: strings.TrimSpace(info.Subtitle), MainAuthor: mainAuthor,
		AdditionalAuthors: additional, Publisher: strings.TrimSpace(info.Publisher), PublishYear: yearFromString(info.PublishedDate),
		Pages: pages, ISBN: NormalizeISBN(isbn), Subjects: strings.Join(info.Categories, ", "), Language: info.Language,
		Abstract: info.Description, CoverImageURL: cover,
	}
	return bib, true
}
