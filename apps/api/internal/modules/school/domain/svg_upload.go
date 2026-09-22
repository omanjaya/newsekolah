package domain

import (
	"encoding/xml"
	"io"
	"strings"
)

// ValidateSVGUpload rejects an SVG logo/favicon that could run script or
// reach outside the file when opened directly. SVG served as
// image/svg+xml is a full XML document: a browser navigating to its URL
// directly -- not through an <img> tag, which disables scripting for the
// resources it loads -- executes any <script> or event-handler attribute
// inside it in the storage origin's security context (stored XSS).
//
// It rejects rather than rewrites: a logo/favicon upload is small and
// infrequent, so refusing an unsafe file and asking the admin to re-export
// it is simpler and harder to get wrong than sanitising arbitrary
// attacker-controlled markup in place.
//
// Rejected:
//   - <script>, <foreignObject> (embeds arbitrary foreign markup, so
//     arbitrary HTML/script), <iframe>, <embed>, <object>
//   - "on*" event-handler attributes (onload, onerror, onclick, ...)
//   - "javascript:" URLs in any attribute
//   - href/xlink:href that is not a same-document fragment (#id) or an
//     image data: URI, i.e. any external reference
//   - a DOCTYPE declaring an entity
//
// Called only after ValidateBrandingWrite's sibling, the sniffed-type
// check in AllowedBrandingImageTypes, has already identified the upload as
// image/svg+xml.
func ValidateSVGUpload(data []byte) error {
	dec := xml.NewDecoder(strings.NewReader(string(data)))
	dec.Strict = true

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			// Malformed XML: not renderable as a well-formed SVG document,
			// and not worth trying to diagnose further than "invalid".
			return ErrUploadInvalidType
		}

		switch t := tok.(type) {
		case xml.Directive:
			if strings.Contains(strings.ToUpper(string(t)), "ENTITY") {
				return ErrUploadInvalidType
			}
		case xml.StartElement:
			if err := validateSVGElement(t); err != nil {
				return err
			}
		}
	}
}

var dangerousSVGElements = map[string]bool{
	"script":        true,
	"foreignobject": true,
	"iframe":        true,
	"embed":         true,
	"object":        true,
}

func validateSVGElement(el xml.StartElement) error {
	if dangerousSVGElements[strings.ToLower(el.Name.Local)] {
		return ErrUploadInvalidType
	}
	for _, attr := range el.Attr {
		if err := validateSVGAttr(attr); err != nil {
			return err
		}
	}
	return nil
}

func validateSVGAttr(attr xml.Attr) error {
	name := strings.ToLower(attr.Name.Local)
	if strings.HasPrefix(name, "on") {
		return ErrUploadInvalidType
	}

	// Browsers ignore ASCII control characters (tabs, newlines, ...) when
	// parsing a URL scheme, a common "java\tscript:" filter bypass, so the
	// same characters are stripped before the scheme check here.
	value := stripASCIIControl(attr.Value)
	if strings.Contains(strings.ToLower(value), "javascript:") {
		return ErrUploadInvalidType
	}

	if name == "href" && isExternalReference(strings.TrimSpace(value)) {
		return ErrUploadInvalidType
	}
	return nil
}

func isExternalReference(value string) bool {
	if value == "" || strings.HasPrefix(value, "#") {
		return false
	}
	return !strings.HasPrefix(strings.ToLower(value), "data:image/")
}

func stripASCIIControl(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r > ' ' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
