package http

import (
	"context"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func toAPILoanRule(r domain.LoanRule) api.LibraryLoanRule {
	out := api.LibraryLoanRule{
		Id: r.ID, StartsOn: openapiDate(r.StartsOn), EndsOn: openapiDate(r.EndsOn), AllowLoans: r.AllowLoans,
		MaxLoanItems: r.MaxLoanItems, MaxLoanDays: r.MaxLoanDays,
	}
	if r.MemberTypeID.Valid {
		id := openapi_types.UUID(r.MemberTypeID.UUID)
		out.MemberTypeId = &id
	}
	if r.Notes != "" {
		out.Notes = &r.Notes
	}
	return out
}

func (h *LibraryHandler) ListLibraryLoanRules(ctx context.Context, _ api.ListLibraryLoanRulesRequestObject) (api.ListLibraryLoanRulesResponseObject, error) {
	rules, err := h.service.ListActiveLoanRules(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryLoanRule, len(rules))
	for i, r := range rules {
		data[i] = toAPILoanRule(r)
	}
	return api.ListLibraryLoanRules200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryLoanRule(ctx context.Context, request api.CreateLibraryLoanRuleRequestObject) (api.CreateLibraryLoanRuleResponseObject, error) {
	b := request.Body
	in := domain.LoanRule{
		StartsOn: b.StartsOn.Time, EndsOn: b.EndsOn.Time, AllowLoans: b.AllowLoans, MaxLoanItems: b.MaxLoanItems, MaxLoanDays: b.MaxLoanDays,
		Notes: strOr(b.Notes), CreatedBy: uuid.NullUUID{UUID: userID(ctx), Valid: true},
	}
	if b.MemberTypeId != nil {
		in.MemberTypeID = uuid.NullUUID{UUID: *b.MemberTypeId, Valid: true}
	}
	r, err := h.service.CreateLoanRule(ctx, tenantID(ctx), in)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryLoanRule201JSONResponse(toAPILoanRule(r)), nil
}

func (h *LibraryHandler) DeleteLibraryLoanRule(ctx context.Context, request api.DeleteLibraryLoanRuleRequestObject) (api.DeleteLibraryLoanRuleResponseObject, error) {
	if err := h.service.DeleteLoanRule(ctx, tenantID(ctx), request.LoanRuleId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryLoanRule204Response{}, nil
}

func toAPIViolation(v domain.Violation) api.LibraryViolation {
	out := api.LibraryViolation{
		Id: v.ID, MemberUserId: v.MemberUserID, Kind: api.LibraryViolationKind(v.Kind), Penalty: api.LibraryPenalty(v.Penalty),
		Amount: v.Amount, SuspendDays: v.SuspendDays, Status: api.LibraryViolationStatus(v.Status), CreatedAt: &v.CreatedAt,
	}
	if v.LoanID.Valid {
		id := openapi_types.UUID(v.LoanID.UUID)
		out.LoanId = &id
	}
	if v.Notes != "" {
		out.Notes = &v.Notes
	}
	if v.SettledAt != nil {
		out.SettledAt = v.SettledAt
	}
	return out
}

func (h *LibraryHandler) ListLibraryViolations(ctx context.Context, request api.ListLibraryViolationsRequestObject) (api.ListLibraryViolationsResponseObject, error) {
	status, kind := "", ""
	if request.Params.Status != nil {
		status = string(*request.Params.Status)
	}
	if request.Params.Kind != nil {
		kind = string(*request.Params.Kind)
	}
	violations, err := h.service.ListViolations(ctx, tenantID(ctx), status, kind, intOr(request.Params.Limit, 50), intOr(request.Params.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryViolation, len(violations))
	for i, v := range violations {
		data[i] = toAPIViolation(v)
	}
	return api.ListLibraryViolations200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryViolation(ctx context.Context, request api.CreateLibraryViolationRequestObject) (api.CreateLibraryViolationResponseObject, error) {
	b := request.Body
	in := service.CreateViolationInput{
		MemberUserID: b.MemberUserId, Kind: domain.ViolationKind(b.Kind), Penalty: domain.Penalty(b.Penalty),
		Amount: intOr(b.Amount, 0), SuspendDays: intOr(b.SuspendDays, 0), Notes: strOr(b.Notes), CreatedBy: userID(ctx),
	}
	if b.LoanId != nil {
		in.LoanID = uuid.NullUUID{UUID: *b.LoanId, Valid: true}
	}
	v, err := h.service.CreateViolation(ctx, tenantID(ctx), in)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryViolation201JSONResponse(toAPIViolation(v)), nil
}

func (h *LibraryHandler) ListMemberViolations(ctx context.Context, request api.ListMemberViolationsRequestObject) (api.ListMemberViolationsResponseObject, error) {
	allowed, err := h.selfOrStaff(ctx, request.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	if !allowed {
		return nil, mapError(domain.ErrForbidden)
	}
	violations, err := h.service.ListViolationsForMember(ctx, tenantID(ctx), request.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryViolation, len(violations))
	for i, v := range violations {
		data[i] = toAPIViolation(v)
	}
	return api.ListMemberViolations200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) SettleLibraryViolation(ctx context.Context, request api.SettleLibraryViolationRequestObject) (api.SettleLibraryViolationResponseObject, error) {
	v, err := h.service.SettleViolation(ctx, tenantID(ctx), request.ViolationId, domain.ViolationStatus(request.Body.Status), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.SettleLibraryViolation200JSONResponse(toAPIViolation(v)), nil
}
