package service

import (
	"html"
	"regexp"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
)

// Announcement bodies come from a rich-text editor and are rendered as
// HTML to every reader, so they are sanitised on the way in. UGCPolicy
// keeps formatting, lists, links and images; StrictPolicy strips
// everything to derive the plain-text copy used by notifications, search
// and the mobile preview.
var (
	htmlPolicy = bluemonday.UGCPolicy()
	textPolicy = bluemonday.StrictPolicy()
)

// Input is what authors submit to create or edit an announcement.
type Input struct {
	Title    string
	BodyHTML string
	Audience domain.Audience
	IsPinned bool
	StartsAt *time.Time
	EndsAt   *time.Time
}

func (in Input) validate() error {
	title := strings.TrimSpace(in.Title)
	if title == "" || len(title) > domain.MaxTitleLength {
		return domain.ErrInvalidInput
	}
	if strings.TrimSpace(in.BodyHTML) == "" || len(in.BodyHTML) > domain.MaxBodyLength {
		return domain.ErrInvalidInput
	}
	if in.StartsAt != nil && in.EndsAt != nil && !in.EndsAt.After(*in.StartsAt) {
		return domain.ErrEndsBeforeStart
	}
	return in.Audience.Validate()
}

// textBreak matches the tags that end a line or a block of text. Stripping
// them alone would glue the words on either side together
// ("hadir.</p><p>Pakaian" -> "hadir.Pakaian"), so each gets a space
// first; inline tags (<strong>, <a>) are stripped without one, so a word
// that is partly bold stays one word.
var textBreak = regexp.MustCompile(`(?i)<br\s*/?>|</(p|div|li|h[1-6]|blockquote|pre|tr|td|th)\s*>`)

func sanitize(bodyHTML string) (cleanHTML, text string) {
	cleanHTML = htmlPolicy.Sanitize(bodyHTML)
	text = html.UnescapeString(textPolicy.Sanitize(textBreak.ReplaceAllStringFunc(bodyHTML, func(tag string) string {
		return tag + " "
	})))
	text = strings.Join(strings.Fields(text), " ")
	return cleanHTML, text
}
