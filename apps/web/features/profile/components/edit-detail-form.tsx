"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataList,
  DataListItem,
  DatePicker,
  Field,
  FormError,
  FormSection,
  Input,
  Select,
  useToast,
  type SelectOption,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { type UserProfileFields, useUpdateProfileMutation } from "../api";

import { ProfileSaveBar } from "./profile-save-bar";

type Kind = "student" | "teacher" | "staff";

/** Fields the school keeps for the reader: shown, never edited here, and sent back unchanged. */
const INSTITUTIONAL: Record<Kind, (keyof UserProfileFields)[]> = {
  student: ["nis", "nisn"],
  teacher: ["nip", "nuptk", "employee_number", "employment_status", "position"],
  staff: ["nip", "nuptk", "employee_number", "employment_status", "position"],
};

/** Fields the reader keeps up to date themselves, per profile kind. */
const PERSONAL: (keyof UserProfileFields)[] = [
  "nik",
  "gender",
  "birth_place",
  "birth_date",
  "religion",
  "blood_type",
  "city",
  "district",
  "address",
];
const OWN: Record<Kind, (keyof UserProfileFields)[]> = {
  student: [
    ...PERSONAL,
    "previous_school",
    "father_name",
    "mother_name",
    "guardian_name",
    "guardian_phone",
  ],
  teacher: [...PERSONAL, "last_education", "specialization"],
  staff: [...PERSONAL, "last_education", "specialization"],
};

const RELIGIONS = ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"];
const BLOOD_TYPES = ["A", "B", "AB", "O"];

type Values = Record<string, string>;

function toValues(initial: UserProfileFields, keys: (keyof UserProfileFields)[]): Values {
  return Object.fromEntries(keys.map((key) => [key, String(initial[key] ?? "")]));
}

/**
 * The student/teacher/staff detail record GET /v1/me returns as `detail`:
 * the fields the school keeps (student numbers, employment) read-only,
 * then the reader's own identity, address and family or education fields
 * in titled groups. A reader with no profile row at all (e.g. a bootstrap
 * super admin) has no such record, so this form only renders for
 * student/teacher/staff.
 */
export function EditDetailForm(): ReactElement | null {
  const { me } = useSession();
  if (
    !me ||
    (me.profile_kind !== "student" && me.profile_kind !== "teacher" && me.profile_kind !== "staff")
  ) {
    return null;
  }
  return <DetailForm kind={me.profile_kind} initial={me.detail ?? {}} />;
}

function DetailForm({ kind, initial }: { kind: Kind; initial: UserProfileFields }): ReactElement {
  const t = useTranslations("app.profile.detail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateProfileMutation();
  const [saved, setSaved] = useState(() => toValues(initial, OWN[kind]));
  const [values, setValues] = useState(saved);
  const [error, setError] = useState<string | null>(null);

  const dirty = OWN[kind].some((key) => values[key] !== saved[key]);
  const set = (key: keyof UserProfileFields) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };
  const text = (key: keyof UserProfileFields) => ({
    value: values[key] ?? "",
    onChange: (event: { target: { value: string } }) => {
      set(key)(event.target.value);
    },
  });
  const withCurrent = (options: string[], current: string): SelectOption[] => [
    { value: "", label: t("unset") },
    ...(current && !options.includes(current) ? [current] : []).map((value) => ({
      value,
      label: value,
    })),
    ...options.map((value) => ({ value, label: value })),
  ];

  async function submit() {
    setError(null);
    // Institutional fields go back exactly as the school stored them.
    const kept = Object.fromEntries(
      INSTITUTIONAL[kind].flatMap((key) => (initial[key] ? [[key, initial[key]]] : [])),
    );
    const own = Object.fromEntries(
      OWN[kind].flatMap((key) => {
        const value = (values[key] ?? "").trim();
        return value ? [[key, value]] : [];
      }),
    );
    try {
      await update.mutateAsync({ detail: { ...kept, ...own } });
      setSaved(values);
      toast.success(t("saved"));
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  const employment = initial.employment_status;
  const institutionalValue = (key: keyof UserProfileFields) => {
    const value = initial[key];
    if (key === "employment_status" && employment) {
      return t.has(`employmentStatuses.${employment}`)
        ? t(`employmentStatuses.${employment}`)
        : employment;
    }
    return value ? String(value) : undefined;
  };

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && <FormError>{error}</FormError>}

      <Card>
        <CardHeader>
          <CardTitle as="h2">
            {kind === "student" ? t("studentSection") : t("employmentSection")}
          </CardTitle>
          <CardDescription>{t("institutionalHint")}</CardDescription>
        </CardHeader>
        <DataList>
          {INSTITUTIONAL[kind].map((key) => (
            <DataListItem
              key={key}
              label={t(key === "employment_status" ? "employmentStatus" : camel(key))}
            >
              {institutionalValue(key)}
            </DataListItem>
          ))}
        </DataList>
      </Card>

      <FormSection variant="card" title={t("identitySection")}>
        <Field label={t("nik")}>
          <Input inputMode="numeric" maxLength={16} {...text("nik")} />
        </Field>
        <Field label={t("gender")}>
          <Select
            options={[
              { value: "", label: t("genderUnset") },
              { value: "L", label: t("genderMale") },
              { value: "P", label: t("genderFemale") },
            ]}
            value={values.gender ?? ""}
            onValueChange={set("gender")}
          />
        </Field>
        <Field label={t("birthPlace")}>
          <Input {...text("birth_place")} />
        </Field>
        <Field label={t("birthDate")}>
          <DatePicker
            value={values.birth_date === "" ? null : (values.birth_date ?? null)}
            onChange={set("birth_date")}
          />
        </Field>
        <Field label={t("religion")}>
          <Select
            options={withCurrent(RELIGIONS, values.religion ?? "")}
            value={values.religion ?? ""}
            onValueChange={set("religion")}
          />
        </Field>
        <Field label={t("bloodType")}>
          <Select
            options={withCurrent(BLOOD_TYPES, values.blood_type ?? "")}
            value={values.blood_type ?? ""}
            onValueChange={set("blood_type")}
          />
        </Field>
      </FormSection>

      <FormSection variant="card" title={t("addressSection")}>
        <Field label={t("address")} className="col-span-full">
          <Input autoComplete="street-address" {...text("address")} />
        </Field>
        <Field label={t("district")}>
          <Input {...text("district")} />
        </Field>
        <Field label={t("city")}>
          <Input autoComplete="address-level2" {...text("city")} />
        </Field>
      </FormSection>

      {kind === "student" ? (
        <FormSection variant="card" title={t("familySection")}>
          <Field label={t("previousSchool")} className="col-span-full">
            <Input {...text("previous_school")} />
          </Field>
          <Field label={t("fatherName")}>
            <Input {...text("father_name")} />
          </Field>
          <Field label={t("motherName")}>
            <Input {...text("mother_name")} />
          </Field>
          <Field label={t("guardianName")}>
            <Input {...text("guardian_name")} />
          </Field>
          <Field label={t("guardianPhone")}>
            <Input type="tel" {...text("guardian_phone")} />
          </Field>
        </FormSection>
      ) : (
        <FormSection variant="card" title={t("educationSection")}>
          <Field label={t("lastEducation")}>
            <Input {...text("last_education")} />
          </Field>
          <Field label={t("specialization")}>
            <Input {...text("specialization")} />
          </Field>
        </FormSection>
      )}

      <ProfileSaveBar
        dirty={dirty}
        saving={update.isPending}
        saveLabel={t("save")}
        onSave={() => void submit()}
      />
    </form>
  );
}

/** `employee_number` -> `employeeNumber`, the catalog's key for a field label. */
function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
