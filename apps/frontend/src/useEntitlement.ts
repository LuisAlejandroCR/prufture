// useEntitlement.ts: React hook wrapping getEntitlement() from src/purchases.ts.
// Screens read `status` only — never the raw ExternalResult — so a degraded RevenueCat
// call can never be mistaken for "free". Distinct from src/purchases.ts (the port itself).

import { useCallback, useEffect, useState } from "react";
import type { ExternalResult } from "@proof/core";
import { getEntitlement, type Entitlement } from "./purchases";

export type EntitlementStatus = "loading" | "entitled" | "free" | "unavailable";

export interface UseEntitlementResult {
  status: EntitlementStatus;
  refresh: () => void;
}

/**
 * Pure mapping from the port's result to the hook's status. `available:false` always maps
 * to "unavailable" — never "free" — so a degraded check can't be read as "no subscription".
 */
export function mapEntitlementResult(result: ExternalResult<Entitlement>): EntitlementStatus {
  if (!result.available) return "unavailable";
  return result.data.entitled ? "entitled" : "free";
}

export function useEntitlement(): UseEntitlementResult {
  const [status, setStatus] = useState<EntitlementStatus>("loading");
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getEntitlement().then((result) => {
      if (cancelled) return;
      setStatus(mapEntitlementResult(result));
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { status, refresh };
}
