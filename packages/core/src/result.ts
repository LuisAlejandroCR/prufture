// result.ts: typed envelope for every call that crosses a process boundary.
// AGENTS.md rule: external calls never throw through the user flow.
// Distinct from types.ts (domain data) — this wraps availability, not proofs.

export interface ExternalOk<T> {
  available: true;
  source: string;
  checkedAt: string;
  data: T;
  error: null;
}

export interface ExternalUnavailable {
  available: false;
  source: string;
  checkedAt: string;
  data: null;
  error: string;
}

export type ExternalResult<T> = ExternalOk<T> | ExternalUnavailable;

export function ok<T>(source: string, data: T): ExternalOk<T> {
  return { available: true, source, checkedAt: new Date().toISOString(), data, error: null };
}

export function unavailable(source: string, error: unknown): ExternalUnavailable {
  return {
    available: false,
    source,
    checkedAt: new Date().toISOString(),
    data: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

/** Run an async op and convert any throw into ExternalUnavailable. */
export async function guard<T>(source: string, op: () => Promise<T>): Promise<ExternalResult<T>> {
  try {
    return ok(source, await op());
  } catch (e) {
    return unavailable(source, e);
  }
}
