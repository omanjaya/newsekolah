"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type AdminUser,
  type ProfileKind,
  type UserWriteFields,
  useCreateUserMutation,
  useRolesQuery,
  useUpdateUserMutation,
} from "../api";

const KINDS: ProfileKind[] = ["teacher", "staff", "student", "parent"];
const SUPER_ADMIN_SLUG = "super_admin";

export function UserForm({
  initial,
  onDone,
}: {
  initial?: AdminUser;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.school.users.form");
  const tKinds = useTranslations("app.school.users.kinds");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const roles = useRolesQuery();
  const create = useCreateUserMutation();
  const update = useUpdateUserMutation();

  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [kind, setKind] = useState<ProfileKind>(initial?.profile_kind ?? "teacher");
  const initialPrimary = initial?.roles.find((r) => r.is_primary);
  const [primaryRoleId, setPrimaryRoleId] = useState(initialPrimary?.id ?? "");
  const [additionalRoleIds, setAdditionalRoleIds] = useState<string[]>(
    initial?.roles.filter((r) => !r.is_primary).map((r) => r.id) ?? [],
  );
  const [nis, setNis] = useState(initial?.profile?.nis ?? "");
  const [nip, setNip] = useState(initial?.profile?.nip ?? "");
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  // The API enforces exactly one primary role that must be a system role,
  // and every additional role must be a tenant-defined custom role
  // (identity/domain/user_admin.go's ValidateRoleGrants), so the form only
  // ever offers choices that satisfy the rule instead of letting an admin
  // build a combination the server will reject.
  const allRoles = roles.data?.data ?? [];
  const isSuperAdmin = me?.roles.some((r) => r.slug === SUPER_ADMIN_SLUG) ?? false;
  const systemRoles = allRoles.filter(
    (r) => r.is_system && (isSuperAdmin || r.slug !== SUPER_ADMIN_SLUG),
  );
  const customRoles = allRoles.filter((r) => !r.is_system);
  const primaryRole = allRoles.find((r) => r.id === primaryRoleId);

  async function submit() {
    setError(null);
    if (!name.trim() || !primaryRoleId) {
      setError(t("requiredError"));
      return;
    }
    const body: UserWriteFields = {
      name: name.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      profile_kind: kind,
      roles: [
        { role_id: primaryRoleId, is_primary: true },
        ...additionalRoleIds.map((role_id) => ({ role_id, is_primary: false })),
      ],
      profile: {
        ...(kind === "student" && nis.trim() ? { nis: nis.trim() } : {}),
        ...(kind === "teacher" && nip.trim() ? { nip: nip.trim() } : {}),
      },
    };
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, body });
        toast.success(t("updated"));
      } else {
        await create.mutateAsync({
          ...body,
          ...(username.trim() ? { username: username.trim() } : {}),
        });
        toast.success(t("created"));
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  const field = (label: string, control: ReactElement) => (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-medium">{label}</span>
      {control}
    </label>
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {field(
          t("name"),
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            required
          />,
        )}
        {field(
          t("username"),
          <Input
            value={username}
            disabled={Boolean(initial)}
            placeholder={t("usernameHint")}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
          />,
        )}
        {field(
          t("email"),
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />,
        )}
        {field(
          t("phone"),
          <Input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
            }}
            placeholder="08..."
          />,
        )}
        {field(
          t("kind"),
          <Select
            options={KINDS.map((k) => ({ value: k, label: tKinds(k) }))}
            value={kind}
            onValueChange={(v) => {
              setKind(v as ProfileKind);
            }}
          />,
        )}
        {kind === "student" &&
          field(
            t("nis"),
            <Input
              value={nis}
              onChange={(e) => {
                setNis(e.target.value);
              }}
            />,
          )}
        {kind === "teacher" &&
          field(
            t("nip"),
            <Input
              value={nip}
              onChange={(e) => {
                setNip(e.target.value);
              }}
            />,
          )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 text-[13px]">
        {field(
          t("primaryRole"),
          <Select
            options={[
              { value: "", label: t("primaryRolePlaceholder") },
              ...systemRoles.map((r) => ({ value: r.id, label: r.name })),
            ]}
            value={primaryRoleId}
            onValueChange={setPrimaryRoleId}
          />,
        )}
        <p className="text-fg-muted">{t("primaryRoleHint")}</p>
        {primaryRole?.slug === "teacher" && (
          <p className="rounded-xs border border-border bg-bg px-3 py-2 text-fg-muted">
            {t("teacherLeaveHint")}
          </p>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{t("additionalRoles")}</legend>
          <p className="text-fg-muted">{t("additionalRolesHint")}</p>
          {customRoles.length === 0 ? (
            <p className="text-fg-muted">{t("noCustomRoles")}</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {customRoles.map((role) => {
                const checked = additionalRoleIds.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className="flex items-center gap-2 rounded-xs border border-border px-3 py-2"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        setAdditionalRoleIds((prev) =>
                          checked ? prev.filter((id) => id !== role.id) : [...prev, role.id],
                        );
                      }}
                    />
                    {role.name}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      </div>

      {!initial && <p className="text-[13px] text-fg-muted">{t("passwordHint")}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
