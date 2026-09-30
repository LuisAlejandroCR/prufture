// enrolment.ts: personhood enrolment helpers for /dashboard/programmes/[id]/enrolment. Validates a
// Semaphore commitment and a programme id exactly as apps/api/src/personhood.ts does, reads the public
// group summary (size, epoch, root; never the commitment list) and maps every coordinator API answer
// to an honest state: unreachable, not entitled (402) and entitlement check down (503) stay distinct.

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

/** Header carrying the RevenueCat app user id; mirrors APP_USER_HEADER in apps/api/src/coordinator.ts. */
export const APP_USER_HEADER = "x-app-user-id";

/** BN254 scalar field; mirrors SNARK_FIELD in apps/api/src/personhood.ts. */
export const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const NUMERIC = /^\d{1,78}$/;
const PROGRAMME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Same rule as isCommitment in apps/api/src/personhood.ts: a decimal field element, never zero. */
export function isCommitment(v: unknown): v is string {
  if (typeof v !== "string" || !NUMERIC.test(v)) return false;
  const n = BigInt(v);
  return n > 0n && n < SNARK_FIELD;
}

/** Same rule as isProgrammeId in apps/api/src/personhood.ts. */
export function isProgrammeId(v: unknown): v is string {
  return typeof v === "string" && PROGRAMME_ID.test(v);
}

/** Plain-language reason a commitment is rejected, or null when it is valid. For the form. */
export function commitmentError(v: string): string | null {
  const s = v.trim();
  if (s === "") return "Enter the commitment shown on the participant's device.";
  if (!/^\d+$/.test(s)) return "A commitment is a decimal number: digits only, no spaces or letters.";
  if (s.length > 78) return "That number is too long to be a commitment.";
  if (!isCommitment(s)) return "That number is outside the valid range (it must be above zero and below the field size).";
  return null;
}

/** What the page shows about a group. The commitment list is deliberately not carried. */
export interface GroupSummary {
  programmeId: string;
  size: number;
  epoch: number;
  root: string | null;
}

export type GroupResult =
  | { state: "ok"; group: GroupSummary }
  | { state: "empty" }
  | { state: "invalid" }
  | { state: "unreachable" };

/** Maps the public GET /personhood/group/:id answer. 404 means nobody is enrolled yet. */
export function toGroupResult(status: number, body: unknown): GroupResult {
  if (status === 404) return { state: "empty" };
  if (status === 400) return { state: "invalid" };
  if (status !== 200 || !body || typeof body !== "object") return { state: "unreachable" };
  const b = body as Record<string, unknown>;
  if (typeof b.programmeId !== "string" || typeof b.epoch !== "number" || !Array.isArray(b.commitments)) {
    return { state: "unreachable" };
  }
  return {
    state: "ok",
    group: {
      programmeId: b.programmeId,
      size: b.commitments.length,
      epoch: b.epoch,
      root: typeof b.root === "string" ? b.root : null,
    },
  };
}

export async function fetchGroup(programmeId: string): Promise<GroupResult> {
  if (!isProgrammeId(programmeId)) return { state: "invalid" };
  let r: Response;
  try {
    r = await fetch(`${BASE}/personhood/group/${encodeURIComponent(programmeId)}`, { cache: "no-store" });
  } catch {
    return { state: "unreachable" };
  }
  let body: unknown = null;
  if (r.status === 200) {
    try {
      body = await r.json();
    } catch {
      return { state: "unreachable" };
    }
  }
  return toGroupResult(r.status, body);
}

/** Outcome of a coordinator write, carried in the page URL as ?result=. */
export type ActionState =
  | "enrolled"
  | "already_enrolled"
  | "new_round"
  | "invalid"
  | "unknown_programme"
  | "not_configured"
  | "not_staff"
  | "not_entitled"
  | "not_admin"
  | "entitlement_down"
  | "unreachable";

export const ACTION_STATES: readonly ActionState[] = [
  "enrolled",
  "already_enrolled",
  "new_round",
  "invalid",
  "unknown_programme",
  "not_configured",
  "not_staff",
  "not_entitled",
  "not_admin",
  "entitlement_down",
  "unreachable",
];

export function isActionState(v: unknown): v is ActionState {
  return typeof v === "string" && (ACTION_STATES as readonly string[]).includes(v);
}

/**
 * Maps a coordinator API status to a state. 402 and 503 are never merged: 503 means the entitlement
 * check itself is down (the api fails closed), which says nothing about whether the plan is active.
 */
export function toActionState(kind: "enrol" | "epoch", status: number, body: unknown): ActionState {
  switch (status) {
    case 200: {
      if (kind === "epoch") return "new_round";
      const added = body && typeof body === "object" ? (body as Record<string, unknown>).added : undefined;
      return added === false ? "already_enrolled" : "enrolled";
    }
    case 400:
      return "invalid";
    case 401:
      return "not_configured";
    case 402:
      return "not_entitled";
    case 403:
      return "not_admin";
    case 404:
      return "unknown_programme";
    case 503:
      return "entitlement_down";
    default:
      return "unreachable";
  }
}

/**
 * Whether a server action may write with the coordinator account. Fails closed: staff sign-in must be
 * configured, the caller signed in, and (when invitations are on) holding a valid invite pass. The
 * /dashboard middleware alone is not enough: server actions are reachable by action id, and the
 * middleware lets every request through when Clerk is not configured.
 */
export function staffWriteAllowed(gate: {
  configured: boolean;
  userId: string | null | undefined;
  inviteRequired: boolean;
  passValid: boolean;
}): boolean {
  if (!gate.configured || !gate.userId) return false;
  return !gate.inviteRequired || gate.passValid;
}

/** Server-only: the RevenueCat app user id this dashboard calls the coordinator API as. */
export function coordinatorAppUserId(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.COORDINATOR_APP_USER_ID?.trim() ?? "";
  return v === "" ? null : v;
}

export async function postCoordinator(
  kind: "enrol" | "epoch",
  body: { programmeId: string; commitment?: string },
  appUserId: string | null = coordinatorAppUserId(),
): Promise<ActionState> {
  if (!isProgrammeId(body.programmeId)) return "invalid";
  if (kind === "enrol" && !isCommitment(body.commitment)) return "invalid";
  if (!appUserId) return "not_configured";
  let r: Response;
  try {
    r = await fetch(`${BASE}/coordinator/personhood/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json", [APP_USER_HEADER]: appUserId },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return "unreachable";
  }
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  return toActionState(kind, r.status, json);
}

export interface ActionNotice {
  tone: "ok" | "info" | "attn" | "wait";
  title: string;
  text: string;
}

/** The plain-language notice for each outcome. Degraded states never claim the write happened. */
export function actionNotice(state: ActionState): ActionNotice {
  switch (state) {
    case "enrolled":
      return { tone: "ok", title: "Participant enrolled", text: "The group has a new root. Their device can now prove membership." };
    case "already_enrolled":
      return { tone: "info", title: "Already enrolled", text: "That commitment was already in the group. Nothing changed." };
    case "new_round":
      return { tone: "ok", title: "New round started", text: "Every enrolled participant can submit once more per task in this round." };
    case "invalid":
      return { tone: "attn", title: "Not accepted", text: "The commitment or programme id was not valid. Nothing was saved." };
    case "unknown_programme":
      return { tone: "attn", title: "No group yet", text: "Enrol at least one participant before starting a new round." };
    case "not_configured":
      return {
        tone: "wait",
        title: "Coordinator access is not configured",
        text: "This dashboard has no coordinator account set (COORDINATOR_APP_USER_ID). Nothing was saved.",
      };
    case "not_staff":
      return {
        tone: "attn",
        title: "Staff sign-in required",
        text: "Only signed-in staff with a redeemed invitation can change a group. Sign in, reload the page and try again. Nothing was saved.",
      };
    case "not_entitled":
      return {
        tone: "attn",
        title: "Coordinator plan required",
        text: "Enrolment needs an active coordinator_pro plan on the coordinator account. Nothing was saved.",
      };
    case "not_admin":
      return {
        tone: "attn",
        title: "This account cannot change groups",
        text: "The coordinator account has the plan but is not a programme admin. Add its app user id (COORDINATOR_APP_USER_ID) to PERSONHOOD_ADMIN_APP_USER_IDS on the api. Nothing was saved.",
      };
    case "entitlement_down":
      return {
        tone: "wait",
        title: "Plan check is unavailable right now",
        text: "We could not confirm the coordinator plan, so the request was refused to be safe. This is a service problem, not a missing plan. Nothing was saved; try again in a minute.",
      };
    case "unreachable":
      return {
        tone: "wait",
        title: "The enrolment service is unreachable",
        text: "We could not reach the api, so we cannot tell whether anything changed. Reload to see the current group before trying again.",
      };
  }
}
