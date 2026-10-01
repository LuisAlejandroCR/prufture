// actions.ts: server actions behind /dashboard/programmes/[id]/enrolment. Checks the caller is signed-in
// staff (fails closed), re-validates the input, calls the coordinator API with the server-held app user
// id (never sent to the browser) and redirects back with ?result=<state> so every outcome is shown plainly.

"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isProgrammeId, newRoundConfirmed, postCoordinator, staffWriteAllowed } from "../../../../../lib/enrolment";
import { isStaffAuthConfigured } from "../../../../../lib/staff-auth";
import { INVITE_COOKIE, isInviteRequired, verifyPass } from "../../../../../lib/staff-invite";

function back(programmeId: string, result: string): never {
  redirect(`/dashboard/programmes/${encodeURIComponent(programmeId)}/enrolment?result=${result}`);
}

// The /dashboard middleware is not a boundary for server actions, so every write re-checks here.
async function isStaff(): Promise<boolean> {
  const configured = isStaffAuthConfigured();
  if (!configured) return false;
  const { userId } = await auth();
  const inviteRequired = isInviteRequired();
  const passValid =
    !!userId && inviteRequired && (await verifyPass((await cookies()).get(INVITE_COOKIE)?.value, userId));
  return staffWriteAllowed({ configured, userId, inviteRequired, passValid });
}

export async function enrolAction(form: FormData): Promise<void> {
  const programmeId = String(form.get("programmeId") ?? "");
  if (!isProgrammeId(programmeId)) redirect("/dashboard/programmes");
  if (!(await isStaff())) back(programmeId, "not_staff");
  const commitment = String(form.get("commitment") ?? "").trim().slice(0, 100);
  back(programmeId, await postCoordinator("enrol", { programmeId, commitment }));
}

export async function newRoundAction(form: FormData): Promise<void> {
  const programmeId = String(form.get("programmeId") ?? "");
  if (!isProgrammeId(programmeId)) redirect("/dashboard/programmes");
  if (!(await isStaff())) back(programmeId, "not_staff");
  // Re-checked here: the form's own check is only a convenience.
  if (!newRoundConfirmed(programmeId, form.get("confirm"))) back(programmeId, "confirm_needed");
  back(programmeId, await postCoordinator("epoch", { programmeId }));
}
