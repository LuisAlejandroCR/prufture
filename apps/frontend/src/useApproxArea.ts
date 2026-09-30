// useApproxArea.ts: the reporter's approximate 5-char cell, a human area name and the centre of their
// city, for sorting tasks and centring maps. Prompts only through requestArea (Home's explicit button;
// the report flow asks on its own) and names the cell centre, not the precise point. Offline or denied: values stay null and callers fall back.

import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AreaStatus } from "./home";
import { encodeGeohash } from "./geohash";
import { cellCentre } from "./tasks";

type Point = { latitude: number; longitude: number };

let cachedCell: string | null = null;
const nameCache = new Map<string, string>();
const centreCache = new Map<string, Point>();

/** District-level name for a cell centre, or null when geocoding is unavailable (offline). */
export async function areaNameForCell(cell: string): Promise<string | null> {
  const hit = nameCache.get(cell);
  if (hit) return hit;
  try {
    const [place] = await Location.reverseGeocodeAsync(cellCentre(cell));
    if (!place) return null;
    const parts = [place.district ?? place.subregion, place.city ?? place.region].filter(
      (p, i, all): p is string => !!p && all.indexOf(p) === i,
    );
    const name = parts.slice(0, 2).join(", ");
    if (!name) return null;
    nameCache.set(cell, name);
    return name;
  } catch {
    return null;
  }
}

/**
 * Centre of the city the cell sits in (a public place, not the reporter's position), or null when
 * geocoding is unavailable. Callers fall back to the cell centre.
 */
export async function cityCentreForCell(cell: string): Promise<Point | null> {
  const hit = centreCache.get(cell);
  if (hit) return hit;
  try {
    const [place] = await Location.reverseGeocodeAsync(cellCentre(cell));
    const city = place?.city ?? place?.subregion;
    if (!city) return null;
    const [found] = await Location.geocodeAsync([city, place?.region, place?.country].filter(Boolean).join(", "));
    if (!found) return null;
    const point = { latitude: found.latitude, longitude: found.longitude };
    centreCache.set(cell, point);
    return point;
  } catch {
    return null;
  }
}

export interface ApproxArea {
  cell: string | null;
  name: string | null;
  centre: Point | null;
  /** Permission / lookup state, for Home's "missions near me" card. */
  status: AreaStatus;
  /** False once iOS will no longer show the prompt (the reporter must use Settings). */
  canAskAgain: boolean;
  /** Asks for location (Home's explicit button only), then looks the area up. */
  requestArea: () => Promise<void>;
}

export function useApproxArea(): ApproxArea {
  const [cell, setCell] = useState<string | null>(cachedCell);
  const [name, setName] = useState<string | null>(cachedCell ? nameCache.get(cachedCell) ?? null : null);
  const [centre, setCentre] = useState<Point | null>(cachedCell ? centreCache.get(cachedCell) ?? null : null);
  const [status, setStatus] = useState<AreaStatus>(cachedCell ? "granted" : "checking");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const alive = useRef(true);

  const lookUp = useCallback(async () => {
    const pos =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    if (!pos || !alive.current) return;
    const next = encodeGeohash(pos.coords.latitude, pos.coords.longitude, 5);
    cachedCell = next;
    setCell(next);
    const label = await areaNameForCell(next);
    if (alive.current && label) setName(label);
    const city = await cityCentreForCell(next);
    if (alive.current && city) setCentre(city);
  }, []);

  const apply = useCallback(
    async (perm: Location.LocationPermissionResponse) => {
      if (!alive.current) return;
      setCanAskAgain(perm.canAskAgain !== false);
      setStatus(perm.granted ? "granted" : perm.status === "denied" ? "denied" : "undetermined");
      if (perm.granted) await lookUp();
    },
    [lookUp],
  );

  useEffect(() => {
    alive.current = true;
    // Never prompts here: only reads the current permission.
    Location.getForegroundPermissionsAsync()
      .then(apply)
      .catch(() => {
        // Location unavailable: callers keep the unsorted list and plain labels.
        if (alive.current) setStatus("undetermined");
      });
    return () => {
      alive.current = false;
    };
  }, [apply]);

  const requestArea = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      await apply(perm.granted || perm.canAskAgain === false ? perm : await Location.requestForegroundPermissionsAsync());
    } catch {
      // Lookup failed (offline or no fix): the card keeps offering a retry.
    }
  }, [apply]);

  return { cell, name, centre, status, canAskAgain, requestArea };
}
