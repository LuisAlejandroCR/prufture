// staff-auth.test.ts: staff sign-in (Clerk) guards only /dashboard. Pins the key check, the path
// rule, and — statically — that Clerk never reaches the root layout, /verify, or public routes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isStaffAuthConfigured, isStaffPath } from "../lib/staff-auth.js";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Clerk is on only when both keys are non-empty", () => {
  assert.equal(isStaffAuthConfigured({}), false);
  assert.equal(isStaffAuthConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" }), false);
  assert.equal(isStaffAuthConfigured({ CLERK_SECRET_KEY: "sk_test_x" }), false);
  assert.equal(isStaffAuthConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: " ", CLERK_SECRET_KEY: "sk_test_x" }), false);
  assert.equal(isStaffAuthConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", CLERK_SECRET_KEY: "sk_test_x" }), true);
});

test("only /dashboard and its children are staff paths", () => {
  for (const p of ["/dashboard", "/dashboard/reports", "/dashboard/exports/csv"]) assert.equal(isStaffPath(p), true, p);
  for (const p of ["/", "/verify/0xabc", "/privacy", "/support", "/dashboards", "/sign-in"])
    assert.equal(isStaffPath(p), false, p);
});

test("middleware matcher covers the dashboard, sign-in and invite only", () => {
  const matcher = src("../middleware.ts").match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const paths = [...matcher.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(paths, ["/dashboard", "/dashboard/:path*", "/sign-in", "/sign-in/:path*", "/invite", "/invite/:path*"]);
});

test("Clerk never loads on the root layout or the public verifier", () => {
  assert.doesNotMatch(src("../app/layout.tsx"), /@clerk\//);
  assert.doesNotMatch(src("../app/verify/[hash]/page.tsx"), /@clerk\//);
  assert.doesNotMatch(src("../app/page.tsx"), /@clerk\//);
});
