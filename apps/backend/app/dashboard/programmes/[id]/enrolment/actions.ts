// actions.ts: server actions behind /dashboard/programmes/[id]/enrolment. Re-validates the input,
// calls the coordinator API with the server-held app user id (never sent to the browser) and
// redirects back with ?result=<state> so every outcome, including degraded ones, is shown plainly.

"use server";

import { redirect } from "next/navigation";
import { isProgrammeId, postCoordinator } from "../../../../../lib/enrolment";

function back(programmeId: string, result: string): never {
  redirect(`/dashboard/programmes/${encodeURIComponent(programmeId)}/enrolment?result=${result}`);
}

export async function enrolAction(form: FormData): Promise<void> {
  const programmeId = String(form.get("programmeId") ?? "");
  if (!isProgrammeId(programmeId)) redirect("/dashboard/programmes");
  const commitment = String(form.get("commitment") ?? "").trim().slice(0, 100);
  back(programmeId, await postCoordinator("enrol", { programmeId, commitment }));
}

export async function newRoundAction(form: FormData): Promise<void> {
  const programmeId = String(form.get("programmeId") ?? "");
  if (!isProgrammeId(programmeId)) redirect("/dashboard/programmes");
  back(programmeId, await postCoordinator("epoch", { programmeId }));
}
