package service

import (
	"html"
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
		return domain.ErrInvalidInput
	}
	return in.Audience.Validate()
}

func sanitize(bodyHTML string) (cleanHTML, text string) {
	cleanHTML = htmlPolicy.Sanitize(bodyHTML)
	text = html.UnescapeString(textPolicy.Sanitize(bodyHTML))
	text = strings.Join(strings.Fields(text), " ")
	return cleanHTML, text
}
