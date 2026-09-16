// Walks the API the way a school actually uses it, against a running dev
// stack, and fails loudly on the first step that does not behave. Unit tests
// cover rules in isolation; this covers the wiring between modules, which is
// where the parity work kept breaking.
//
// Usage: pnpm dev:docker && pnpm dev:docker:seed, then
//   node scripts/api-smoke.mjs [--url http://localhost:8080] [--tenant sma-contoh]
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const BASE = flag("url", "http://localhost:8080");
const TENANT = flag("tenant", "sma-contoh");
const PASSWORD = flag("password", "Password123!");

let failures = 0;
let checks = 0;

function ok(label, detail = "") {
  checks += 1;
  console.log(`  ok   ${label}${detail ? ` (${detail})` : ""}`);
}

function fail(label, detail) {
  checks += 1;
  failures += 1;
  console.log(`  FAIL ${label}\n       ${detail}`);
}

function step(name) {
  console.log(`\n${name}`);
}

async function call(method, path, { token, body, expect } = {}) {
  const headers = { "X-Tenant-Slug": TENANT };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  const expected = Array.isArray(expect) ? expect : expect === undefined ? null : [expect];
  if (expected && !expected.includes(res.status)) {
    const code = parsed?.error?.code ?? "";
    throw new Error(
      `${method} ${path} returned ${res.status} ${code}, expected ${expected.join(" or ")}: ${
        typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 300)
      }`,
    );
  }
  return { status: res.status, body: parsed };
}

// Logging in is rate limited per account, so each user signs in once and the
// token is reused for every later step.
const tokens = new Map();

async function login(username) {
  const cached = tokens.get(username);
  if (cached) return cached;
  const { body } = await call("POST", "/v1/auth/login", {
    body: { username, password: PASSWORD, client: "ios" },
    expect: 200,
  });
  tokens.set(username, body.access_token);
  return body.access_token;
}

// Runs one named check, turning a thrown error into a reported failure so the
// rest of the walk still runs and reports everything wrong in one pass.
async function check(label, fn) {
  try {
    const detail = await fn();
    ok(label, typeof detail === "string" ? detail : "");
  } catch (error) {
    fail(label, error.message);
  }
}

const unique = () => Math.random().toString(36).slice(2, 8);

async function main() {
  console.log(`API smoke against ${BASE}, tenant ${TENANT}`);

  step("Auth");
  let admin;
  await check("admin logs in", async () => {
    admin = await login("admin");
    return "access token issued";
  });
  if (!admin) {
    console.log("\ncannot continue without an admin token");
    process.exit(1);
  }
  await check("GET /v1/me names the signed-in user", async () => {
    const { body } = await call("GET", "/v1/me", { token: admin, expect: 200 });
    if (!body.name) throw new Error("no user name in the response");
    return body.name;
  });
  await check("login rejects an unknown client with 4xx, not 500", async () => {
    const { status } = await call("POST", "/v1/auth/login", {
      body: { username: "admin", password: PASSWORD, client: "smoke-client" },
      expect: [400, 422],
    });
    return `status ${status}`;
  });
  await check("login rejects a wrong password", async () => {
    const { status } = await call("POST", "/v1/auth/login", {
      body: { username: "admin", password: "wrong-on-purpose", client: "ios" },
      expect: [401, 429],
    });
    return `status ${status}`;
  });
  await check("a request without a token is refused", async () => {
    const { status } = await call("GET", "/v1/me", { expect: 401 });
    return `status ${status}`;
  });

  step("Academic context");
  let yearId, classId, studentId;
  await check("the active academic year is readable", async () => {
    const { body } = await call("GET", "/v1/academic/years", { token: admin, expect: 200 });
    const active = (body.data ?? []).find((y) => y.is_active);
    if (!active) throw new Error("no active year");
    yearId = active.id;
    return active.label;
  });
  await check("the seeded class is readable", async () => {
    const { body } = await call("GET", `/v1/academic/classes?academic_year_id=${yearId}`, {
      token: admin,
      expect: 200,
    });
    const first = (body.data ?? [])[0];
    if (!first) throw new Error("no class");
    classId = first.id;
    return first.name;
  });
  await check("the class has an enrolled student", async () => {
    const { body } = await call("GET", `/v1/academic/classes/${classId}/enrollments`, {
      token: admin,
      expect: 200,
    });
    const first = (body.data ?? [])[0];
    if (!first) throw new Error("no enrollment");
    studentId = first.student_user_id;
    return first.student_name ?? studentId;
  });

  step("Discipline: record, threshold, warning letter");
  let typeIds = [];
  await check("violation types are readable", async () => {
    const { body } = await call("GET", "/v1/discipline/violation-types", {
      token: admin,
      expect: 200,
    });
    typeIds = (body.data ?? []).map((t) => t.id);
    if (typeIds.length < 2) throw new Error("need at least two violation types");
    return `${typeIds.length} types`;
  });
  await check("recording several violations at once returns the new total", async () => {
    const { body } = await call("POST", "/v1/discipline/violations", {
      token: admin,
      expect: [200, 201],
      body: {
        student_user_id: studentId,
        violation_type_ids: typeIds.slice(0, 2),
        occurred_on: new Date().toISOString().slice(0, 10),
        notes: "smoke test",
      },
    });
    if (typeof body.total_points !== "number") throw new Error("no total_points in the response");
    return `total ${body.total_points}`;
  });
  await check("recording against a non-student is refused", async () => {
    const { status } = await call("POST", "/v1/discipline/violations", {
      token: admin,
      expect: [400, 404, 409, 422],
      body: {
        student_user_id: "00000000-0000-0000-0000-000000000000",
        violation_type_ids: typeIds.slice(0, 1),
        occurred_on: new Date().toISOString().slice(0, 10),
      },
    });
    return `status ${status}`;
  });
  await check("the student's discipline summary lists due levels", async () => {
    const { body } = await call(`GET`, `/v1/discipline/students/${studentId}`, {
      token: admin,
      expect: 200,
    });
    if (!Array.isArray(body.due_levels)) throw new Error("no due_levels");
    return `${body.total_points} points, ${body.due_levels.length} level(s) due`;
  });

  step("Grading: manual report score without any grades");
  await check("a manual override can be set for a student with no grades", async () => {
    const terms = await call("GET", `/v1/academic/years/${yearId}/terms`, {
      token: admin,
      expect: 200,
    });
    const term = (terms.body.data ?? []).find((t) => t.is_active) ?? (terms.body.data ?? [])[0];
    if (!term) throw new Error("no term");
    const offerings = await call("GET", `/v1/academic/years/${yearId}/subject-offerings`, {
      token: admin,
      expect: 200,
    });
    const subjectId = (offerings.body.data ?? [])[0]?.subject_id;
    if (!subjectId) throw new Error("no subject offering");
    const { body } = await call("PUT", "/v1/grading/report-scores/manual", {
      token: admin,
      expect: [200, 201],
      body: {
        academic_year_id: yearId,
        term_id: term.id,
        class_id: classId,
        subject_id: subjectId,
        student_user_id: studentId,
        manual_score: 82,
      },
    });
    if (body.final_score !== 82) throw new Error(`final_score is ${body.final_score}, expected 82`);
    return "final score follows the override";
  });

  step("Library: member, copy, borrow, return");
  let memberTypeId, titleId, copyId, loanId;
  const barcode = `SMOKE-${unique()}`;
  await check("a member type can be created", async () => {
    const { body } = await call("POST", "/v1/library/member-types", {
      token: admin,
      expect: [200, 201],
      body: {
        name: `Smoke type ${unique()}`,
        max_loan_items: 3,
        max_loan_days: 7,
        renewal_days: 3,
        max_renewals: 1,
        fine_type: "constant",
        fine_per_tenor: 0,
        tenor_days: 1,
        suspend_days: 0,
        validity_months: 12,
      },
    });
    memberTypeId = body.id;
    return body.name;
  });
  await check("a student can be registered as a member", async () => {
    const { body } = await call("POST", "/v1/library/members", {
      token: admin,
      expect: [200, 201, 409],
      body: { user_id: studentId, member_type_id: memberTypeId },
    });
    return body?.member_no ?? "already a member";
  });
  await check("a title and a copy can be created", async () => {
    const title = await call("POST", "/v1/library/titles", {
      token: admin,
      expect: [200, 201],
      body: { title: `Smoke title ${unique()}`, author: "Smoke", is_opac: true },
    });
    titleId = title.body.id;
    const copy = await call("POST", `/v1/library/titles/${titleId}/copies`, {
      token: admin,
      expect: [200, 201],
      body: { barcode, is_opac: true },
    });
    copyId = copy.body.id;
    return barcode;
  });
  await check("the copy is findable by its barcode", async () => {
    const { body } = await call(
      "GET",
      `/v1/library/copies/find?code=${encodeURIComponent(barcode)}`,
      { token: admin, expect: 200 },
    );
    if (body.id !== copyId) throw new Error("found a different copy");
    return "same copy";
  });
  await check("borrowing the copy succeeds", async () => {
    const { body } = await call("POST", "/v1/library/loans/borrow", {
      token: admin,
      expect: [200, 201],
      body: { barcode, member_user_id: studentId },
    });
    loanId = body.id;
    return `due ${body.due_on}`;
  });
  await check("borrowing the same copy twice is refused", async () => {
    const { status } = await call("POST", "/v1/library/loans/borrow", {
      token: admin,
      expect: [400, 409, 422],
      body: { barcode, member_user_id: studentId },
    });
    return `status ${status}`;
  });
  await check("returning by barcode closes the loan", async () => {
    const { body } = await call("POST", "/v1/library/loans/return-by-barcode", {
      token: admin,
      expect: [200, 201],
      body: { barcode },
    });
    if (body.status !== "returned") throw new Error(`loan status is ${body.status}`);
    return `fine ${body.fine_amount ?? 0}`;
  });

  step("Library: import preview and commit");
  // Import rows name a material type and a category by code, and a fresh
  // tenant has neither, so create them first: that is the same order a
  // librarian follows before their first import.
  let materialCode, categoryCode;
  await check("master data for the import exists", async () => {
    materialCode = `BK${unique()}`.toUpperCase();
    await call("POST", "/v1/library/material-types", {
      token: admin,
      expect: [200, 201],
      body: {
        code: materialCode,
        name: "Buku smoke",
        max_loan_items: 3,
        max_loan_days: 7,
        max_renewals: 1,
        is_active: true,
        sort_order: 0,
      },
    });
    categoryCode = `KT${unique()}`.toUpperCase();
    const category = await call("POST", "/v1/library/collection-categories", {
      token: admin,
      expect: [200, 201, 404],
      body: { code: categoryCode, name: "Umum smoke", is_active: true, sort_order: 0 },
    });
    if (category.status === 404) categoryCode = undefined;
    return categoryCode ? "material type and category" : "material type only";
  });
  const importRow = (title) => ({
    row_number: 1,
    title,
    main_author: "Smoke",
    copies: 1,
    material_type: materialCode,
    ...(categoryCode ? { category: categoryCode } : {}),
  });
  await check("a valid import row previews as a new title", async () => {
    const { body } = await call("POST", "/v1/library/import/preview", {
      token: admin,
      expect: 200,
      body: {
        rows: [importRow(`Import smoke ${unique()}`)],
      },
    });
    const first = (body.rows ?? [])[0];
    if (!first) throw new Error("no preview rows");
    if (first.status === "error") throw new Error(`row rejected: ${first.message}`);
    return first.status;
  });
  await check("an import row without a title is reported as an error row", async () => {
    const { body } = await call("POST", "/v1/library/import/preview", {
      token: admin,
      expect: 200,
      body: { rows: [{ row_number: 1, main_author: "Smoke", copies: 1 }] },
    });
    const first = (body.rows ?? [])[0];
    if (first?.status !== "error") throw new Error(`status is ${first?.status}, expected error`);
    return "row flagged";
  });
  await check("committing an import creates the title", async () => {
    const name = `Import smoke ${unique()}`;
    const { body } = await call("POST", "/v1/library/import/commit", {
      token: admin,
      expect: [200, 201],
      body: { rows: [{ ...importRow(name), copies: 2 }] },
    });
    if (!body.created_titles && !body.created_copies) {
      throw new Error(`nothing created: ${JSON.stringify(body).slice(0, 200)}`);
    }
    return `${body.created_titles ?? 0} title(s), ${body.created_copies ?? 0} copies`;
  });

  step("Library: reports and dashboard");
  for (const [label, path] of [
    ["dashboard", "/v1/library/dashboard"],
    ["summary report", "/v1/library/reports/summary"],
    ["accession register", "/v1/library/reports/accession-register"],
    ["members report", "/v1/library/reports/members"],
    ["visits report", "/v1/library/reports/visits"],
  ]) {
    await check(`${label} responds`, async () => {
      const { status } = await call("GET", path, { token: admin, expect: 200 });
      return `status ${status}`;
    });
  }

  step("Permits: a leave request needs evidence before it is issued");
  await check("a student can submit a leave request", async () => {
    const student = await login("siswa");
    const today = new Date().toISOString().slice(0, 10);
    const { status, body } = await call("POST", "/v1/leave-requests", {
      token: student,
      // A student may already have one open from an earlier run, and the
      // rule is one at a time, so that answer is just as correct.
      expect: [200, 201, 409],
      body: { category: "sick", reason: "Smoke test", starts_on: today, ends_on: today },
    });
    if (status === 409) return "one already in progress, as the rule requires";
    if (!body.id) throw new Error("no instance id");
    return body.status ?? "submitted";
  });

  step("Authorization");
  await check("a student cannot read the user directory", async () => {
    const student = await login("siswa");
    const { status } = await call("GET", "/v1/users", { token: student, expect: [401, 403] });
    return `status ${status}`;
  });
  await check("a student cannot create a violation record", async () => {
    const student = await login("siswa");
    const { status } = await call("POST", "/v1/discipline/violations", {
      token: student,
      expect: [401, 403],
      body: {
        student_user_id: studentId,
        violation_type_ids: typeIds.slice(0, 1),
        occurred_on: new Date().toISOString().slice(0, 10),
      },
    });
    return `status ${status}`;
  });

  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`\nsmoke run stopped: ${error.message}`);
  process.exit(1);
});
