// map-region.ts: where a CellMap opens. Centres on the reporter's approximate area (or the city centre
// geocoding found for it) at city zoom; without one, fits only the cells near the first one, so
// assignments on other continents never zoom the map out to a world view. Pure, so node --test covers it.

import { decodeGeohashBounds } from "./geohash";
import { cellCentre } from "./tasks";

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** About 20 km across: a 5 km cell plus its neighbourhood. */
export const CITY_DELTA = 0.18;
const MAX_DELTA = 2;
/** Cells further than this (degrees) from the first cell are left out of a fitted view. */
const NEAR_DEG = 1;

export function mapRegion(
  cells: string[],
  focusCell: string | null,
  cityCentre?: { latitude: number; longitude: number } | null,
): Region | undefined {
  if (focusCell) {
    const c = cityCentre ?? cellCentre(focusCell);
    return { ...c, latitudeDelta: CITY_DELTA, longitudeDelta: CITY_DELTA };
  }
  const first = cells[0];
  if (!first) return undefined;
  const anchor = cellCentre(first);
  const near = cells.filter((cell) => {
    const p = cellCentre(cell);
    return Math.abs(p.latitude - anchor.latitude) <= NEAR_DEG && Math.abs(p.longitude - anchor.longitude) <= NEAR_DEG;
  });
  const boxes = near.map(decodeGeohashBounds);
  const latMin = Math.min(...boxes.map((b) => b.latMin));
  const latMax = Math.max(...boxes.map((b) => b.latMax));
  const lngMin = Math.min(...boxes.map((b) => b.lngMin));
  const lngMax = Math.max(...boxes.map((b) => b.lngMax));
  const clamp = (d: number) => Math.min(MAX_DELTA, Math.max(CITY_DELTA, d));
  return {
    latitude: (latMin + latMax) / 2,
    longitude: (lngMin + lngMax) / 2,
    latitudeDelta: clamp((latMax - latMin) * 1.6),
    longitudeDelta: clamp((lngMax - lngMin) * 1.6),
  };
}
