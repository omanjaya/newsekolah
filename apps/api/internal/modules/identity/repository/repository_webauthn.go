package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) ListWebAuthnCredentials(ctx context.Context, tenantID, userID uuid.UUID) ([]service.WebAuthnCredential, error) {
	rows, err := r.queries(ctx).ListWebAuthnCredentials(ctx, db.ListWebAuthnCredentialsParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		return nil, fmt.Errorf("list webauthn credentials: %w", err)
	}
	creds := make([]service.WebAuthnCredential, len(rows))
	for i, row := range rows {
		cred, err := toWebAuthnCredential(row)
		if err != nil {
			return nil, err
		}
		creds[i] = cred
	}
	return creds, nil
}

func (r *Repository) GetWebAuthnCredential(ctx context.Context, tenantID, id uuid.UUID) (service.WebAuthnCredential, error) {
	row, err := r.queries(ctx).GetWebAuthnCredential(ctx, db.GetWebAuthnCredentialParams{TenantID: tenantID, ID: id})
	if err != nil {
		return service.WebAuthnCredential{}, fmt.Errorf("get webauthn credential: %w", err)
	}
	return toWebAuthnCredential(row)
}

func (r *Repository) InsertWebAuthnCredential(ctx context.Context, tenantID, userID uuid.UUID, name string, cred webauthn.Credential) (service.WebAuthnCredential, error) {
	data, err := json.Marshal(cred)
	if err != nil {
		return service.WebAuthnCredential{}, fmt.Errorf("marshal webauthn credential: %w", err)
	}
	transports := make([]string, len(cred.Transport))
	for i, t := range cred.Transport {
		transports[i] = string(t)
	}

	row, err := r.queries(ctx).InsertWebAuthnCredential(ctx, db.InsertWebAuthnCredentialParams{
		TenantID: tenantID, UserID: userID, CredentialID: cred.ID, PublicKey: cred.PublicKey,
		SignCount: int64(cred.Authenticator.SignCount), Transports: transports, Name: nullableText(name), Data: data,
	})
	if err != nil {
		return service.WebAuthnCredential{}, fmt.Errorf("insert webauthn credential: %w", err)
	}
	return toWebAuthnCredential(row)
}

func (r *Repository) UpdateWebAuthnCredentialUsage(ctx context.Context, tenantID, id uuid.UUID, cred webauthn.Credential) error {
	data, err := json.Marshal(cred)
	if err != nil {
		return fmt.Errorf("marshal webauthn credential: %w", err)
	}
	return r.queries(ctx).UpdateWebAuthnCredentialUsage(ctx, db.UpdateWebAuthnCredentialUsageParams{
		TenantID: tenantID, ID: id, SignCount: int64(cred.Authenticator.SignCount), Data: data,
	})
}

func (r *Repository) RenameWebAuthnCredential(ctx context.Context, tenantID, id uuid.UUID, name string) (service.WebAuthnCredential, error) {
	row, err := r.queries(ctx).RenameWebAuthnCredential(ctx, db.RenameWebAuthnCredentialParams{TenantID: tenantID, ID: id, Name: nullableText(name)})
	if err != nil {
		return service.WebAuthnCredential{}, fmt.Errorf("rename webauthn credential: %w", err)
	}
	return toWebAuthnCredential(row)
}

func (r *Repository) DeleteWebAuthnCredential(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).DeleteWebAuthnCredential(ctx, db.DeleteWebAuthnCredentialParams{TenantID: tenantID, ID: id})
}

func toWebAuthnCredential(row db.WebauthnCredential) (service.WebAuthnCredential, error) {
	var cred webauthn.Credential
	if len(row.Data) > 0 {
		if err := json.Unmarshal(row.Data, &cred); err != nil {
			return service.WebAuthnCredential{}, fmt.Errorf("unmarshal webauthn credential: %w", err)
		}
	}
	out := service.WebAuthnCredential{
		ID:         row.ID,
		UserID:     row.UserID,
		Name:       row.Name.String,
		CreatedAt:  pdatabase.TimeOrZero(row.CreatedAt),
		Credential: cred,
	}
	out.LastUsedAt = pdatabase.TimePtr(row.LastUsedAt)
	return out, nil
}
