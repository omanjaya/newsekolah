"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Input, Select, useToast } from "@newsekolah/ui";
import { LogOut, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import {
  useRoleTestingQuery,
  useRoleTestingSwitchMutation,
} from "../features/auth/role-testing-api";
import { confirmUnsavedChangesBeforeNavigation } from "../lib/navigation/use-unsaved-changes-protection";
import { useSession } from "../lib/session/session-provider";

export function RoleTestingSwitcher(): ReactElement | null {
  const { me } = useSession();
  const status = useRoleTestingQuery({}, Boolean(me));
  const t = useTranslations("app.shell.roleTesting");
  const router = useRouter();
  const toast = useToast();
  const mutation = useRoleTestingSwitchMutation();
  const [open, setOpen] = useState(false);

  if (!status.data?.available && !status.data?.active) return null;

  const selectedSlug = status.data.selected_role_slug;
  const selectedRole =
    status.data.roles.find((role) => role.slug === selectedSlug)?.name ?? selectedSlug ?? "";
  const roleNames = me?.roles.map((role) => role.name).join(", ") ?? "";

  async function returnToAdmin() {
    if (!confirmUnsavedChangesBeforeNavigation()) return;
    try {
      await mutation.mutateAsync(null);
      router.replace("/dashboard");
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 401 ? t("sessionExpired") : t("returnFailed"),
      );
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1" data-testid="role-testing-switcher">
      {status.data.active && me && (
        <span
          className="hidden min-w-0 flex-col text-right text-[11px] leading-tight lg:flex"
          title={t("actualRoles", { roles: roleNames })}
        >
          <span className="max-w-40 truncate font-medium text-fg">{me.name}</span>
          <span className="max-w-40 truncate text-fg-muted">{selectedRole}</span>
        </span>
      )}
      <Button
        size="sm"
        variant="secondary"
        icon={<UserRoundCog />}
        aria-label={t("changeRole")}
        title={t("changeRole")}
        onClick={() => {
          setOpen(true);
        }}
        className="px-2 md:px-3"
      >
        <span className="hidden sm:inline">{t("changeRole")}</span>
      </Button>
      {status.data.active && (
        <Button
          size="sm"
          variant="ghost"
          icon={<LogOut />}
          aria-label={t("return")}
          title={t("return")}
          loading={mutation.isPending}
          onClick={() => {
            void returnToAdmin();
          }}
          className="px-2 md:px-3"
        >
          <span className="hidden xl:inline">{t("return")}</span>
        </Button>
      )}
      <RoleTestingDialog open={open} onOpenChange={setOpen} roles={status.data.roles} />
    </div>
  );
}

function RoleTestingDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: { slug: string; name: string }[];
}): ReactElement {
  const t = useTranslations("app.shell.roleTesting");
  const router = useRouter();
  const toast = useToast();
  const mutation = useRoleTestingSwitchMutation();
  const [roleChoice, setRoleChoice] = useState("");
  const role = roles.some((item) => item.slug === roleChoice) ? roleChoice : (roles[0]?.slug ?? "");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([""]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const cursor = cursors[cursors.length - 1] ?? "";
  const accounts = useRoleTestingQuery(
    { role, q: debouncedSearch || undefined, cursor: cursor || undefined },
    open && role !== "",
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  async function switchToUser() {
    if (!selectedUser || !role || !confirmUnsavedChangesBeforeNavigation()) return;
    try {
      await mutation.mutateAsync({ userId: selectedUser, role });
      onOpenChange(false);
      router.replace("/dashboard");
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 401 ? t("sessionExpired") : t("switchFailed"),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("title")}
        description={t("description")}
        className="max-w-lg"
        data-testid="role-testing-dialog"
      >
        <div className="flex flex-col gap-4">
          {roles.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("noRoles")}</p>
          ) : (
            <>
              <div>
                <label
                  id="role-testing-role-label"
                  className="mb-1 block text-[13px] font-medium text-fg"
                >
                  {t("role")}
                </label>
                <Select
                  aria-labelledby="role-testing-role-label"
                  value={role}
                  onValueChange={(value) => {
                    setRoleChoice(value);
                    setSelectedUser(null);
                    setCursors([""]);
                  }}
                  options={roles.map((item) => ({ value: item.slug, label: item.name }))}
                />
              </div>
              <label className="text-[13px] font-medium text-fg">
                {t("search")}
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSelectedUser(null);
                    setCursors([""]);
                  }}
                  className="mt-1"
                />
              </label>
              <div>
                <p className="mb-2 text-[13px] font-medium text-fg">{t("accounts")}</p>
                {accounts.isPending || accounts.isFetching ? (
                  <p className="text-[13px] text-fg-muted">{t("loading")}</p>
                ) : null}
                {accounts.isError && (
                  <div className="flex items-center gap-2 text-[13px] text-fg-muted">
                    <span>{t("loadError")}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void accounts.refetch();
                      }}
                    >
                      {t("retry")}
                    </Button>
                  </div>
                )}
                {!accounts.isError && !accounts.isPending && accounts.data.users.length === 0 && (
                  <p className="text-[13px] text-fg-muted">{t("noUsers")}</p>
                )}
                {!accounts.isError && !accounts.isPending && accounts.data.users.length ? (
                  <div className="max-h-56 overflow-y-auto rounded-sm border border-border">
                    {accounts.data.users.map((user) => (
                      <label
                        key={user.id}
                        htmlFor={`role-testing-user-${user.id}`}
                        aria-label={`${user.name} (${user.username})`}
                        className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-bg"
                      >
                        <input
                          id={`role-testing-user-${user.id}`}
                          type="radio"
                          name="role-testing-account"
                          value={user.id}
                          checked={selectedUser === user.id}
                          onChange={() => {
                            setSelectedUser(user.id);
                          }}
                          className="size-4 accent-accent"
                        />
                        <span className="min-w-0 flex flex-col">
                          <span className="truncate text-[13px] font-medium text-fg">
                            {user.name}
                          </span>
                          <span className="truncate text-[12px] text-fg-muted">
                            {user.username}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex justify-between gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={cursors.length <= 1 || accounts.isFetching}
                    onClick={() => {
                      setCursors((items) => items.slice(0, -1));
                      setSelectedUser(null);
                    }}
                  >
                    {t("previous")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!accounts.data?.next_cursor || accounts.isFetching}
                    onClick={() => {
                      const nextCursor = accounts.data?.next_cursor;
                      if (nextCursor) setCursors((items) => [...items, nextCursor]);
                      setSelectedUser(null);
                    }}
                  >
                    {t("next")}
                  </Button>
                </div>
              </div>
              <p className="text-[12px] text-fg-muted">{t("permissionsNote")}</p>
              <div className="flex justify-end">
                <Button
                  disabled={!selectedUser || accounts.isFetching}
                  loading={mutation.isPending}
                  onClick={() => {
                    void switchToUser();
                  }}
                >
                  {t("switch")}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
