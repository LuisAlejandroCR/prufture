// useApproxArea.ts: the reporter's approximate 5-char cell, a human area name and the centre of their
// city, for sorting tasks and centring maps. Never prompts for permission (the report flow does that)
// and names the cell centre, not the precise point. Offline or denied: values stay null and callers fall back.

import * as Location from "expo-location";
import { useEffect, useState } from "react";
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

export function useApproxArea(): { cell: string | null; name: string | null; centre: Point | null } {
  const [cell, setCell] = useState<string | null>(cachedCell);
  const [name, setName] = useState<string | null>(cachedCell ? nameCache.get(cachedCell) ?? null : null);
  const [centre, setCentre] = useState<Point | null>(cachedCell ? centreCache.get(cachedCell) ?? null : null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const pos =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
        if (!pos || !alive) return;
        const next = encodeGeohash(pos.coords.latitude, pos.coords.longitude, 5);
        cachedCell = next;
        setCell(next);
        const label = await areaNameForCell(next);
        if (alive && label) setName(label);
        const city = await cityCentreForCell(next);
        if (alive && city) setCentre(city);
      } catch {
        // Location unavailable: callers keep the unsorted list and plain labels.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { cell, name, centre };
}
