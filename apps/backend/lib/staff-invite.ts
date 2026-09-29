// staff-invite.ts: the invitation-code step after staff sign-in. A signed-in Clerk user reaches
// /dashboard only after redeeming a code from STAFF_INVITE_CODES; the redemption is stored as a code
// hash, and a signed cookie caches it so middleware does not call Clerk on every request.

type Env = Record<string, string | undefined>;

/** Codes shorter than this are ignored: with no rate limit, a short code is guessable. */
export const MIN_CODE_LENGTH = 8;
export const INVITE_PATH = "/invite";
export const INVITE_COOKIE = "prufture_staff_invite";
/** The cached pass is re-checked against Clerk at least this often. */
export const INVITE_COOKIE_MAX_AGE_S = 12 * 60 * 60;

/** Case-insensitive, surrounding spaces ignored: "  unicef-lima-2026 " equals "UNICEF-LIMA-2026". */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Active codes from STAFF_INVITE_CODES (comma or newline separated), normalized, short ones dropped. */
export function inviteCodes(env: Env = process.env): string[] {
  return (env.STAFF_INVITE_CODES ?? "")
    .split(/[,\n]/)
    .map(normalizeCode)
    .filter((c) => c.length >= MIN_CODE_LENGTH);
}

/** The gate is on only when at least one usable code is configured. */
export function isInviteRequired(env: Env = process.env): boolean {
  return inviteCodes(env).length > 0;
}

export function isInvitePath(pathname: string): boolean {
  return pathname === INVITE_PATH || pathname.startsWith(`${INVITE_PATH}/`);
}

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of the normalized code. Only this hash is ever stored on the user or in a cookie. */
export async function codeHash(code: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(`prufture-invite|${normalizeCode(code)}`)));
}

/** Length-independent string compare, so a guess leaks nothing through timing. */
function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Hash of the matching active code, or null. Every active code is compared, match or not. */
export async function matchInvite(input: string, env: Env = process.env): Promise<string | null> {
  const want = await codeHash(input);
  let found: string | null = null;
  for (const c of inviteCodes(env)) {
    const h = await codeHash(c);
    if (sameString(h, want)) found = h;
  }
  return found;
}

/** True while `hash` belongs to a code still in STAFF_INVITE_CODES; removing a code revokes it. */
export async function isActiveCodeHash(hash: unknown, env: Env = process.env): Promise<boolean> {
  if (typeof hash !== "string" || !hash) return false;
  let ok = false;
  for (const c of inviteCodes(env)) if (sameString(await codeHash(c), hash)) ok = true;
  return ok;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`staff-invite|${message}`)));
}

function passSecret(env: Env): string {
  return env.CLERK_SECRET_KEY?.trim() ?? "";
}

/** Cookie value binding this user to the code hash they redeemed: `<codeHash>.<hmac>`. */
export async function signPass(userId: string, hash: string, env: Env = process.env): Promise<string> {
  const secret = passSecret(env);
  if (!secret) throw new Error("no signing secret");
  return `${hash}.${await hmac(secret, `${userId}|${hash}`)}`;
}

/** Valid only for this user, with an untampered signature, and while the code is still active. */
export async function verifyPass(value: string | undefined, userId: string, env: Env = process.env): Promise<boolean> {
  const secret = passSecret(env);
  if (!value || !userId || !secret) return false;
  const [hash, sig] = value.split(".");
  if (!hash || !sig) return false;
  if (!sameString(sig, await hmac(secret, `${userId}|${hash}`))) return false;
  return isActiveCodeHash(hash, env);
}
