package domain

import (
	"errors"
	"testing"
)

func TestValidateSVGUpload(t *testing.T) {
	tests := []struct {
		name    string
		svg     string
		wantErr bool
	}{
		{
			name: "benign logo ok",
			svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="8" fill="#1F3A5F" />
  <circle cx="50" cy="50" r="20" fill="#FFFFFF" />
</svg>`,
			wantErr: false,
		},
		{
			name: "internal fragment use ok",
			svg: `<svg xmlns="http://www.w3.org/2000/svg">
  <defs><circle id="dot" r="4" /></defs>
  <use href="#dot" x="10" y="10" />
</svg>`,
			wantErr: false,
		},
		{
			name: "image data URI ok",
			svg: `<svg xmlns="http://www.w3.org/2000/svg">
  <image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10" />
</svg>`,
			wantErr: false,
		},
		{
			name:    "script element rejected",
			svg:     `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>`,
			wantErr: true,
		},
		{
			name:    "onload handler rejected",
			svg:     `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`,
			wantErr: true,
		},
		{
			name:    "onerror handler on nested element rejected",
			svg:     `<svg xmlns="http://www.w3.org/2000/svg"><image href="x" onerror="alert(1)" /></svg>`,
			wantErr: true,
		},
		{
			name: "javascript URI rejected",
			svg: `<svg xmlns="http://www.w3.org/2000/svg">
  <a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(1)"><text>click</text></a>
</svg>`,
			wantErr: true,
		},
		{
			name:    "javascript URI with control-char bypass rejected",
			svg:     "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"x\"><a href=\"java\tscript:alert(1)\"><text>x</text></a></svg>",
			wantErr: true,
		},
		{
			name:    "foreignObject rejected",
			svg:     `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>`,
			wantErr: true,
		},
		{
			name:    "external http reference rejected",
			svg:     `<svg xmlns="http://www.w3.org/2000/svg"><image href="http://evil.example/track.png" /></svg>`,
			wantErr: true,
		},
		{
			name:    "protocol-relative external reference rejected",
			svg:     `<svg xmlns="http://www.w3.org/2000/svg"><image xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="//evil.example/track.png" /></svg>`,
			wantErr: true,
		},
		{
			name:    "iframe rejected",
			svg:     `<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.example"></iframe></svg>`,
			wantErr: true,
		},
		{
			name:    "external entity declaration rejected",
			svg:     `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>`,
			wantErr: true,
		},
		{
			name:    "malformed XML rejected",
			svg:     `<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateSVGUpload([]byte(tt.svg))
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateSVGUpload() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, ErrUploadInvalidType) {
				t.Fatalf("ValidateSVGUpload() error = %v, want ErrUploadInvalidType", err)
			}
		})
	}
}
