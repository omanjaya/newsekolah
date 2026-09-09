"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AdminUser,
  type ProfileKind,
  type UserWriteFields,
  useCreateUserMutation,
  useRolesQuery,
  useUpdateUserMutation,
} from "../api";

const KINDS: ProfileKind[] = ["teacher", "staff", "student", "parent"];

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
  const roles = useRolesQuery();
  const create = useCreateUserMutation();
  const update = useUpdateUserMutation();

  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [kind, setKind] = useState<ProfileKind>(initial?.profile_kind ?? "teacher");
  const [roleIds, setRoleIds] = useState<string[]>(initial?.roles.map((r) => r.id) ?? []);
  const [primaryRole, setPrimaryRole] = useState(
    initial?.roles.find((r) => r.is_primary)?.id ?? "",
  );
  const [nis, setNis] = useState(initial?.profile?.nis ?? "");
  const [nip, setNip] = useState(initial?.profile?.nip ?? "");
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  async function submit() {
    setError(null);
    if (!name.trim() || roleIds.length === 0) {
      setError(t("requiredError"));
      return;
    }
    const primary = roleIds.includes(primaryRole) ? primaryRole : roleIds[0];
    const body: UserWriteFields = {
      name: name.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      profile_kind: kind,
      roles: roleIds.map((role_id) => ({ role_id, is_primary: role_id === primary })),
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
      <fieldset className="flex flex-col gap-2 text-[13px]">
        <legend className="font-medium">{t("roles")}</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {(roles.data?.data ?? []).map((role) => {
            const checked = roleIds.includes(role.id);
            return (
              <div
                key={role.id}
                className="flex items-center justify-between gap-2 rounded-xs border border-border px-3 py-2"
              >
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      setRoleIds((prev) =>
                        checked ? prev.filter((id) => id !== role.id) : [...prev, role.id],
                      );
                    }}
                  />
                  {role.name}
                </label>
                {checked && (
                  <label className="flex items-center gap-1 text-[12px] text-fg-muted">
                    <input
                      type="radio"
                      name="primary-role"
                      checked={
                        primaryRole === role.id ||
                        (!roleIds.includes(primaryRole) && roleIds[0] === role.id)
                      }
                      onChange={() => {
                        setPrimaryRole(role.id);
                      }}
                    />
                    {t("primary")}
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
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
