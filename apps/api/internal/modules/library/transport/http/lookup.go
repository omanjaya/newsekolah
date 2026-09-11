package http

import (
	"context"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *LibraryHandler) LookupLibrary(ctx context.Context, request api.LookupLibraryRequestObject) (api.LookupLibraryResponseObject, error) {
	results, err := h.service.Lookup(ctx, tenantID(ctx), request.Params.Q)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryLookupResult, len(results))
	for i, r := range results {
		var out api.LibraryLookupResult
		if r.Member != nil {
			m := r.Member
			member := struct {
				MemberNo *string            `json:"member_no,omitempty"`
				Nis      *string            `json:"nis,omitempty"`
				UserId   openapi_types.UUID `json:"user_id"`
				UserName string             `json:"user_name"`
				Username *string            `json:"username,omitempty"`
			}{UserId: m.UserID, UserName: m.UserName}
			if m.Username != "" {
				member.Username = &m.Username
			}
			if m.NIS != "" {
				member.Nis = &m.NIS
			}
			if m.MemberNo != "" {
				member.MemberNo = &m.MemberNo
			}
			out.Member = &member
		}
		if r.Copy != nil {
			c := r.Copy
			out.Copy = &struct {
				Barcode string                `json:"barcode"`
				CopyId  openapi_types.UUID    `json:"copy_id"`
				Status  api.LibraryCopyStatus `json:"status"`
				Title   string                `json:"title"`
				TitleId openapi_types.UUID    `json:"title_id"`
			}{Barcode: c.Barcode, CopyId: c.CopyID, Status: api.LibraryCopyStatus(c.Status), Title: c.Title, TitleId: c.TitleID}
		}
		data[i] = out
	}
	return api.LookupLibrary200JSONResponse{Data: data}, nil
}
