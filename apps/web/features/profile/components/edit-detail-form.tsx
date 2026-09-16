"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { type UserProfileFields, useUpdateProfileMutation } from "../api";

/**
 * The student/teacher/staff detail record GET /v1/me now returns as
 * `detail` (docs item 5): common identity fields for everyone with a
 * profile, plus a field group specific to the profile kind. A parent
 * account has no such record (UserProfileFields describes the student's
 * own family columns, not a parent's own profile), so this form only
 * renders for student/teacher/staff.
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

function field(label: string, control: ReactElement) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-medium">{label}</span>
      {control}
    </label>
  );
}

function DetailForm({
  kind,
  initial,
}: {
  kind: "student" | "teacher" | "staff";
  initial: UserProfileFields;
}): ReactElement {
  const t = useTranslations("app.profile.detail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateProfileMutation();

  const [nik, setNik] = useState(initial.nik ?? "");
  const [gender, setGender] = useState(initial.gender ?? "");
  const [birthPlace, setBirthPlace] = useState(initial.birth_place ?? "");
  const [birthDate, setBirthDate] = useState(initial.birth_date ?? "");
  const [religion, setReligion] = useState(initial.religion ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [district, setDistrict] = useState(initial.district ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [bloodType, setBloodType] = useState(initial.blood_type ?? "");

  const [nis, setNis] = useState(initial.nis ?? "");
  const [nisn, setNisn] = useState(initial.nisn ?? "");
  const [previousSchool, setPreviousSchool] = useState(initial.previous_school ?? "");
  const [fatherName, setFatherName] = useState(initial.father_name ?? "");
  const [motherName, setMotherName] = useState(initial.mother_name ?? "");
  const [guardianName, setGuardianName] = useState(initial.guardian_name ?? "");
  const [guardianPhone, setGuardianPhone] = useState(initial.guardian_phone ?? "");

  const [nip, setNip] = useState(initial.nip ?? "");
  const [nuptk, setNuptk] = useState(initial.nuptk ?? "");
  const [employmentStatus, setEmploymentStatus] = useState(initial.employment_status ?? "");
  const [lastEducation, setLastEducation] = useState(initial.last_education ?? "");
  const [specialization, setSpecialization] = useState(initial.specialization ?? "");
  const [employeeNumber, setEmployeeNumber] = useState(initial.employee_number ?? "");
  const [position, setPosition] = useState(initial.position ?? "");

  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const detail: UserProfileFields = {
      ...(nik.trim() ? { nik: nik.trim() } : {}),
      ...(gender ? { gender } : {}),
      ...(birthPlace.trim() ? { birth_place: birthPlace.trim() } : {}),
      ...(birthDate ? { birth_date: birthDate } : {}),
      ...(religion.trim() ? { religion: religion.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(district.trim() ? { district: district.trim() } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(bloodType.trim() ? { blood_type: bloodType.trim() } : {}),
      ...(kind === "student"
        ? {
            ...(nis.trim() ? { nis: nis.trim() } : {}),
            ...(nisn.trim() ? { nisn: nisn.trim() } : {}),
            ...(previousSchool.trim() ? { previous_school: previousSchool.trim() } : {}),
            ...(fatherName.trim() ? { father_name: fatherName.trim() } : {}),
            ...(motherName.trim() ? { mother_name: motherName.trim() } : {}),
            ...(guardianName.trim() ? { guardian_name: guardianName.trim() } : {}),
            ...(guardianPhone.trim() ? { guardian_phone: guardianPhone.trim() } : {}),
          }
        : {
            ...(nip.trim() ? { nip: nip.trim() } : {}),
            ...(nuptk.trim() ? { nuptk: nuptk.trim() } : {}),
            ...(employmentStatus.trim() ? { employment_status: employmentStatus.trim() } : {}),
            ...(lastEducation.trim() ? { last_education: lastEducation.trim() } : {}),
            ...(specialization.trim() ? { specialization: specialization.trim() } : {}),
            ...(employeeNumber.trim() ? { employee_number: employeeNumber.trim() } : {}),
            ...(position.trim() ? { position: position.trim() } : {}),
          }),
    };
    try {
      await update.mutateAsync({ detail });
      toast.success(t("saved"));
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

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
          t("nik"),
          <Input
            value={nik}
            maxLength={16}
            onChange={(e) => {
              setNik(e.target.value);
            }}
          />,
        )}
        {field(
          t("gender"),
          <Select
            options={[
              { value: "", label: t("genderUnset") },
              { value: "L", label: t("genderMale") },
              { value: "P", label: t("genderFemale") },
            ]}
            value={gender}
            onValueChange={(v) => {
              setGender(v as "" | "L" | "P");
            }}
          />,
        )}
        {field(
          t("birthPlace"),
          <Input
            value={birthPlace}
            onChange={(e) => {
              setBirthPlace(e.target.value);
            }}
          />,
        )}
        {field(
          t("birthDate"),
          <Input
            type="date"
            value={birthDate}
            onChange={(e) => {
              setBirthDate(e.target.value);
            }}
          />,
        )}
        {field(
          t("religion"),
          <Input
            value={religion}
            onChange={(e) => {
              setReligion(e.target.value);
            }}
          />,
        )}
        {field(
          t("bloodType"),
          <Input
            value={bloodType}
            maxLength={3}
            placeholder="O+"
            onChange={(e) => {
              setBloodType(e.target.value);
            }}
          />,
        )}
        {field(
          t("city"),
          <Input
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
            }}
          />,
        )}
        {field(
          t("district"),
          <Input
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
            }}
          />,
        )}
        {field(
          t("address"),
          <Input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
            }}
          />,
        )}
      </div>

      {kind === "student" ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="text-[13px] font-medium text-fg">{t("studentSection")}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {field(
              t("nis"),
              <Input
                value={nis}
                onChange={(e) => {
                  setNis(e.target.value);
                }}
              />,
            )}
            {field(
              t("nisn"),
              <Input
                value={nisn}
                onChange={(e) => {
                  setNisn(e.target.value);
                }}
              />,
            )}
            {field(
              t("previousSchool"),
              <Input
                value={previousSchool}
                onChange={(e) => {
                  setPreviousSchool(e.target.value);
                }}
              />,
            )}
            {field(
              t("fatherName"),
              <Input
                value={fatherName}
                onChange={(e) => {
                  setFatherName(e.target.value);
                }}
              />,
            )}
            {field(
              t("motherName"),
              <Input
                value={motherName}
                onChange={(e) => {
                  setMotherName(e.target.value);
                }}
              />,
            )}
            {field(
              t("guardianName"),
              <Input
                value={guardianName}
                onChange={(e) => {
                  setGuardianName(e.target.value);
                }}
              />,
            )}
            {field(
              t("guardianPhone"),
              <Input
                type="tel"
                value={guardianPhone}
                onChange={(e) => {
                  setGuardianPhone(e.target.value);
                }}
              />,
            )}
          </div>
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-4">
          <legend className="text-[13px] font-medium text-fg">{t("employmentSection")}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {field(
              t("nip"),
              <Input
                value={nip}
                onChange={(e) => {
                  setNip(e.target.value);
                }}
              />,
            )}
            {field(
              t("nuptk"),
              <Input
                value={nuptk}
                onChange={(e) => {
                  setNuptk(e.target.value);
                }}
              />,
            )}
            {field(
              t("employmentStatus"),
              <Input
                value={employmentStatus}
                onChange={(e) => {
                  setEmploymentStatus(e.target.value);
                }}
              />,
            )}
            {field(
              t("lastEducation"),
              <Input
                value={lastEducation}
                onChange={(e) => {
                  setLastEducation(e.target.value);
                }}
              />,
            )}
            {field(
              t("specialization"),
              <Input
                value={specialization}
                onChange={(e) => {
                  setSpecialization(e.target.value);
                }}
              />,
            )}
            {field(
              t("employeeNumber"),
              <Input
                value={employeeNumber}
                onChange={(e) => {
                  setEmployeeNumber(e.target.value);
                }}
              />,
            )}
            {field(
              t("position"),
              <Input
                value={position}
                onChange={(e) => {
                  setPosition(e.target.value);
                }}
              />,
            )}
          </div>
        </fieldset>
      )}

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" size="sm" loading={update.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
