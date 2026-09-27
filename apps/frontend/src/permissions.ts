// permissions.ts: the single place the guided report flow asks the OS for camera and location access.
// Screens call here, never the expo permission APIs directly, so rationale copy and the
// required/optional policy live in one file.

import { Camera } from "expo-camera";
import * as Location from "expo-location";

export type PermissionStatus = "granted" | "denied" | "undetermined";

export interface PermissionState {
  /** Camera is REQUIRED-HARD: no camera means no capture and no report. */
  camera: PermissionStatus;
  /** Location is REQUIRED-HARD: proof of where the activity happened is the point of the
   *  product. Denied -> the report cannot be submitted (see docs/location_privacy.md). */
  location: PermissionStatus;
}

/** Rationale strings shown on the permissions screen. Kept here so copy is reviewed in one place. */
export const RATIONALE = {
  camera: "Take photos of the activity. Photos stay on this phone until you finish the report.",
  location:
    "Confirm where the activity happened. The public record shows only an approximate area; the precise point is encrypted on this phone for the programme team.",
} as const;

function normalize(status: string, canAskAgain: boolean): PermissionStatus {
  if (status === "granted") return "granted";
  if (status === "undetermined" && canAskAgain) return "undetermined";
  return "denied";
}

export async function requestCamera(): Promise<PermissionStatus> {
  try {
    const res = await Camera.requestCameraPermissionsAsync();
    return normalize(res.status, res.canAskAgain ?? true);
  } catch {
    return "denied";
  }
}

export async function requestLocation(): Promise<PermissionStatus> {
  try {
    const res = await Location.requestForegroundPermissionsAsync();
    return normalize(res.status, res.canAskAgain ?? true);
  } catch {
    return "denied";
  }
}

export async function getPermissionState(): Promise<PermissionState> {
  const [cam, loc] = await Promise.all([
    Camera.getCameraPermissionsAsync().catch(() => null),
    Location.getForegroundPermissionsAsync().catch(() => null),
  ]);
  return {
    camera: cam ? normalize(cam.status, cam.canAskAgain ?? true) : "undetermined",
    location: loc ? normalize(loc.status, loc.canAskAgain ?? true) : "undetermined",
  };
}
