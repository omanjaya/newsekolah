// Package http adapts the generated strict-server interface to the
// platform console service.
package http

import (
	"context"
	"errors"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type PlatformHandler struct{ service *service.Service }

func New(svc *service.Service) *PlatformHandler { return &PlatformHandler{service: svc} }

var errorMap = map[error]*httpx.Error{
	domain.ErrTenancyDisabled:      httpx.ErrPlatformTenancyDisabled,
	domain.ErrTenantNotFound:       httpx.ErrPlatformTenantNotFound,
	domain.ErrSlugTaken:            httpx.ErrPlatformSlugTaken,
	domain.ErrDomainTaken:          httpx.ErrPlatformDomainTaken,
	domain.ErrUnknownModule:        httpx.ErrPlatformUnknownModule,
	domain.ErrExportNotFound:       httpx.ErrPlatformExportNotFound,
	domain.ErrStorageDisabled:      httpx.ErrPlatformStorageDisabled,
	domain.ErrInvalidInput:         httpx.ErrValidation,
	domain.ErrTelegramTokenMissing: httpx.ErrPlatformTelegramTokenMissing,
	domain.ErrTelegramChatMissing:  httpx.ErrPlatformTelegramChatMissing,
	domain.ErrTelegramAPI:          httpx.ErrPlatformTelegramAPIError,
	domain.ErrTelegramRequest:      httpx.ErrPlatformTelegramUnreachable,
}

func mapError(err error) error {
	for d, h := range errorMap {
		if errors.Is(err, d) {
			return h
		}
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func toAPITenant(t domain.Tenant) api.PlatformTenant {
	out := api.PlatformTenant{
		Id: openapi_types.UUID(t.ID), Slug: t.Slug, Name: t.Name,
		EducationLevel: api.PlatformEducationLevel(t.EducationLevel),
		Timezone:       t.Timezone, Status: api.PlatformTenantStatus(t.Status), CreatedAt: t.CreatedAt,
	}
	if t.PrimaryDomain != "" {
		out.PrimaryDomain = &t.PrimaryDomain
	}
	return out
}

func toAPIHealth(h domain.TenantHealth) api.PlatformTenantHealth {
	out := api.PlatformTenantHealth{
		Id: openapi_types.UUID(h.ID), Slug: h.Slug, Name: h.Name,
		EducationLevel: api.PlatformEducationLevel(h.EducationLevel),
		Timezone:       h.Timezone, Status: api.PlatformTenantStatus(h.Status), CreatedAt: h.CreatedAt,
		UserCount: h.UserCount, StorageBucket: h.StorageBucket,
	}
	if h.PrimaryDomain != "" {
		out.PrimaryDomain = &h.PrimaryDomain
	}
	if h.ActiveAcademicYear != "" {
		out.ActiveAcademicYear = &h.ActiveAcademicYear
	}
	out.LastActivityAt = h.LastActivityAt
	return out
}

func toAPIFlags(flags []domain.ModuleFlag) []api.PlatformModuleFlag {
	out := make([]api.PlatformModuleFlag, len(flags))
	for i, f := range flags {
		out[i] = api.PlatformModuleFlag{Module: api.PlatformModule(f.Module), Enabled: f.Enabled}
	}
	return out
}

func toAPIExport(e service.ExportView) api.PlatformExport {
	out := api.PlatformExport{
		Id: openapi_types.UUID(e.ID), TenantId: openapi_types.UUID(e.TenantID),
		Status: api.PlatformExportStatus(e.Status), CreatedAt: e.CreatedAt, CompletedAt: e.CompletedAt,
	}
	if e.DownloadURL != "" {
		out.DownloadUrl = &e.DownloadURL
	}
	if e.ErrorMessage != "" {
		out.ErrorMessage = &e.ErrorMessage
	}
	return out
}

func (h *PlatformHandler) ListPlatformTenants(ctx context.Context, _ api.ListPlatformTenantsRequestObject) (api.ListPlatformTenantsResponseObject, error) {
	tenants, err := h.service.ListTenants(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.PlatformTenantHealth, len(tenants))
	for i, t := range tenants {
		data[i] = toAPIHealth(t)
	}
	return api.ListPlatformTenants200JSONResponse{Data: data}, nil
}

func (h *PlatformHandler) CreatePlatformTenant(ctx context.Context, request api.CreatePlatformTenantRequestObject) (api.CreatePlatformTenantResponseObject, error) {
	b := request.Body
	email := ""
	if b.AdminEmail != nil {
		email = string(*b.AdminEmail)
	}
	result, err := h.service.CreateTenant(ctx, domain.TenantInput{
		Slug: b.Slug, Name: b.Name, EducationLevel: string(b.EducationLevel), Timezone: b.Timezone,
		AdminUsername: b.AdminUsername, AdminEmail: email, AdminName: b.AdminName,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreatePlatformTenant201JSONResponse{
		Tenant: toAPITenant(result.Tenant), AdminUsername: result.AdminUsername, AdminPassword: result.AdminPassword,
	}, nil
}

func (h *PlatformHandler) GetPlatformTenant(ctx context.Context, request api.GetPlatformTenantRequestObject) (api.GetPlatformTenantResponseObject, error) {
	detail, err := h.service.GetTenantDetail(ctx, request.TenantId)
	if err != nil {
		return nil, mapError(err)
	}
	health := toAPIHealth(detail.TenantHealth)
	return api.GetPlatformTenant200JSONResponse{
		Id: health.Id, Slug: health.Slug, Name: health.Name, EducationLevel: health.EducationLevel,
		Timezone: health.Timezone, Status: health.Status, PrimaryDomain: health.PrimaryDomain,
		CreatedAt: health.CreatedAt, UserCount: health.UserCount, ActiveAcademicYear: health.ActiveAcademicYear,
		LastActivityAt: health.LastActivityAt, StorageBucket: health.StorageBucket,
		Flags: toAPIFlags(detail.Flags),
	}, nil
}

func (h *PlatformHandler) SuspendPlatformTenant(ctx context.Context, request api.SuspendPlatformTenantRequestObject) (api.SuspendPlatformTenantResponseObject, error) {
	t, err := h.service.SuspendTenant(ctx, request.TenantId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.SuspendPlatformTenant200JSONResponse(toAPITenant(t)), nil
}

func (h *PlatformHandler) ResumePlatformTenant(ctx context.Context, request api.ResumePlatformTenantRequestObject) (api.ResumePlatformTenantResponseObject, error) {
	t, err := h.service.ResumeTenant(ctx, request.TenantId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ResumePlatformTenant200JSONResponse(toAPITenant(t)), nil
}

func (h *PlatformHandler) UpdatePlatformTenantDomain(ctx context.Context, request api.UpdatePlatformTenantDomainRequestObject) (api.UpdatePlatformTenantDomainResponseObject, error) {
	t, err := h.service.UpdateTenantDomain(ctx, request.TenantId, request.Body.Domain)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdatePlatformTenantDomain200JSONResponse(toAPITenant(t)), nil
}

func (h *PlatformHandler) ListPlatformTenantFlags(ctx context.Context, request api.ListPlatformTenantFlagsRequestObject) (api.ListPlatformTenantFlagsResponseObject, error) {
	flags, err := h.service.ListFlags(ctx, request.TenantId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListPlatformTenantFlags200JSONResponse{Data: toAPIFlags(flags)}, nil
}

func (h *PlatformHandler) SetPlatformTenantFlag(ctx context.Context, request api.SetPlatformTenantFlagRequestObject) (api.SetPlatformTenantFlagResponseObject, error) {
	flag, err := h.service.SetFlag(ctx, request.TenantId, string(request.Module), request.Body.Enabled)
	if err != nil {
		return nil, mapError(err)
	}
	return api.SetPlatformTenantFlag200JSONResponse{Module: api.PlatformModule(flag.Module), Enabled: flag.Enabled}, nil
}

func (h *PlatformHandler) RequestPlatformTenantExport(ctx context.Context, request api.RequestPlatformTenantExportRequestObject) (api.RequestPlatformTenantExportResponseObject, error) {
	export, err := h.service.RequestExport(ctx, request.TenantId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.RequestPlatformTenantExport201JSONResponse(toAPIExport(service.ExportView{Export: export})), nil
}

func (h *PlatformHandler) GetPlatformTenantExport(ctx context.Context, request api.GetPlatformTenantExportRequestObject) (api.GetPlatformTenantExportResponseObject, error) {
	view, err := h.service.GetExport(ctx, request.TenantId, request.ExportId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetPlatformTenantExport200JSONResponse(toAPIExport(view)), nil
}

func toAPIOperatorAlertSettings(view domain.OperatorAlertSettingsView) api.PlatformOperatorAlertSettings {
	out := api.PlatformOperatorAlertSettings{
		Enabled: view.Enabled, TelegramChatId: view.TelegramChatID, TelegramTokenSet: view.TelegramTokenSet,
		CheckHealth: view.CheckHealth, CheckContainers: view.CheckContainers, CheckDisk: view.CheckDisk,
		CheckMemory: view.CheckMemory, CheckBackup: view.CheckBackup, CheckCertificate: view.CheckCertificate,
		CheckErrors5xx:       view.CheckErrors5xx,
		DiskThresholdPercent: view.DiskThresholdPercent, MemoryThresholdMb: view.MemoryThresholdMB,
		BackupMaxAgeHours: view.BackupMaxAgeHours, CertExpiryDays: view.CertExpiryDays,
		DailySummaryEnabled: view.DailySummaryEnabled, DailySummaryHour: view.DailySummaryHour,
		UpdatedAt: view.UpdatedAt,
	}
	if view.TelegramTokenHint != "" {
		out.TelegramTokenHint = &view.TelegramTokenHint
	}
	if view.UpdatedBy.Valid {
		id := openapi_types.UUID(view.UpdatedBy.UUID)
		out.UpdatedBy = &id
	}
	return out
}

func (h *PlatformHandler) GetPlatformOperatorAlertSettings(ctx context.Context, _ api.GetPlatformOperatorAlertSettingsRequestObject) (api.GetPlatformOperatorAlertSettingsResponseObject, error) {
	view, err := h.service.GetOperatorAlertSettings(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetPlatformOperatorAlertSettings200JSONResponse(toAPIOperatorAlertSettings(view)), nil
}

func (h *PlatformHandler) UpdatePlatformOperatorAlertSettings(ctx context.Context, request api.UpdatePlatformOperatorAlertSettingsRequestObject) (api.UpdatePlatformOperatorAlertSettingsResponseObject, error) {
	b := request.Body
	patch := domain.OperatorAlertSettingsPatch{
		Enabled: b.Enabled, TelegramToken: b.TelegramToken, TelegramChatID: b.TelegramChatId,
		CheckHealth: b.CheckHealth, CheckContainers: b.CheckContainers, CheckDisk: b.CheckDisk,
		CheckMemory: b.CheckMemory, CheckBackup: b.CheckBackup, CheckCertificate: b.CheckCertificate,
		CheckErrors5xx:       b.CheckErrors5xx,
		DiskThresholdPercent: b.DiskThresholdPercent, MemoryThresholdMB: b.MemoryThresholdMb,
		BackupMaxAgeHours: b.BackupMaxAgeHours, CertExpiryDays: b.CertExpiryDays,
		DailySummaryEnabled: b.DailySummaryEnabled, DailySummaryHour: b.DailySummaryHour,
	}
	if b.TelegramTokenClear != nil {
		patch.ClearTelegramToken = *b.TelegramTokenClear
	}

	actorUserID, _ := httpx.UserIDFromContext(ctx)
	view, err := h.service.UpdateOperatorAlertSettings(ctx, actorUserID, patch)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdatePlatformOperatorAlertSettings200JSONResponse(toAPIOperatorAlertSettings(view)), nil
}

func (h *PlatformHandler) DetectPlatformOperatorAlertChat(ctx context.Context, request api.DetectPlatformOperatorAlertChatRequestObject) (api.DetectPlatformOperatorAlertChatResponseObject, error) {
	var override string
	if request.Body != nil && request.Body.TelegramToken != nil {
		override = *request.Body.TelegramToken
	}
	candidates, err := h.service.DetectOperatorAlertChats(ctx, override)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.PlatformOperatorAlertChatCandidate, len(candidates))
	for i, c := range candidates {
		data[i] = api.PlatformOperatorAlertChatCandidate{Id: c.ID, Type: c.Type, Title: c.Title}
	}
	return api.DetectPlatformOperatorAlertChat200JSONResponse{Data: data}, nil
}

func (h *PlatformHandler) TestPlatformOperatorAlert(ctx context.Context, _ api.TestPlatformOperatorAlertRequestObject) (api.TestPlatformOperatorAlertResponseObject, error) {
	err := h.service.SendTestOperatorAlert(ctx)
	if err == nil {
		return api.TestPlatformOperatorAlert200JSONResponse{Success: true}, nil
	}
	// domain.ErrTelegramTokenMissing/ErrTelegramChatMissing are
	// configuration problems (the console should not even have shown the
	// "send test" button), so they still map to a request error. Only
	// Telegram's own answer (ErrTelegramAPI) and a failure to reach it
	// (ErrTelegramRequest) are reported inside the 200 body, per this
	// operation's contract: a failed test send is Telegram's answer, not
	// this request failing.
	if errors.Is(err, domain.ErrTelegramTokenMissing) || errors.Is(err, domain.ErrTelegramChatMissing) {
		return nil, mapError(err)
	}
	msg := err.Error()
	return api.TestPlatformOperatorAlert200JSONResponse{Success: false, Error: &msg}, nil
}
