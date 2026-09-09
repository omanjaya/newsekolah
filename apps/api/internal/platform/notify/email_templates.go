package notify

import (
	"bytes"
	"fmt"
	"html/template"
	textTemplate "text/template"
)

// NotificationEmailData is what the single-notification email template
// renders. It is intentionally plain data (no domain import): the
// notifications module fills this in from its own Notification entity.
type NotificationEmailData struct {
	Title string
	Body  string
	Href  string
}

var notificationHTMLTemplate = template.Must(template.New("notification").Parse(`<!doctype html>
<html><body style="font-family:sans-serif;color:#1a1a1a">
<h2 style="margin-bottom:4px">{{.Title}}</h2>
<p>{{.Body}}</p>
{{if .Href}}<p><a href="{{.Href}}">{{.Href}}</a></p>{{end}}
</body></html>`))

var notificationTextTemplate = textTemplate.Must(textTemplate.New("notification").Parse(
	`{{.Title}}

{{.Body}}
{{if .Href}}
{{.Href}}
{{end}}`))

// RenderNotificationEmail renders the HTML and plain-text bodies for a
// single-notification email.
func RenderNotificationEmail(data NotificationEmailData) (htmlBody, textBody string, err error) {
	var htmlBuf, textBuf bytes.Buffer
	if err := notificationHTMLTemplate.Execute(&htmlBuf, data); err != nil {
		return "", "", fmt.Errorf("render notification HTML email: %w", err)
	}
	if err := notificationTextTemplate.Execute(&textBuf, data); err != nil {
		return "", "", fmt.Errorf("render notification text email: %w", err)
	}
	return htmlBuf.String(), textBuf.String(), nil
}

// DigestEmailItem is one summarized notification in a daily digest.
type DigestEmailItem struct {
	Title string
	Href  string
}

// DigestEmailData is what the daily digest email template renders.
type DigestEmailData struct {
	Items []DigestEmailItem
}

var digestHTMLTemplate = template.Must(template.New("digest").Parse(`<!doctype html>
<html><body style="font-family:sans-serif;color:#1a1a1a">
<h2>Ringkasan notifikasi</h2>
<ul>
{{range .Items}}<li>{{if .Href}}<a href="{{.Href}}">{{.Title}}</a>{{else}}{{.Title}}{{end}}</li>
{{end}}
</ul>
</body></html>`))

var digestTextTemplate = textTemplate.Must(textTemplate.New("digest").Parse(
	`Ringkasan notifikasi
{{range .Items}}
- {{.Title}}{{if .Href}} ({{.Href}}){{end}}
{{end}}`))

// RenderDigestEmail renders the HTML and plain-text bodies for the daily
// digest email.
func RenderDigestEmail(data DigestEmailData) (htmlBody, textBody string, err error) {
	var htmlBuf, textBuf bytes.Buffer
	if err := digestHTMLTemplate.Execute(&htmlBuf, data); err != nil {
		return "", "", fmt.Errorf("render digest HTML email: %w", err)
	}
	if err := digestTextTemplate.Execute(&textBuf, data); err != nil {
		return "", "", fmt.Errorf("render digest text email: %w", err)
	}
	return htmlBuf.String(), textBuf.String(), nil
}
