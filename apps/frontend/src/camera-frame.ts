// camera-frame.ts: padding for the full-bleed live camera, which draws its own chrome instead of
// using <Screen>. The top clears the notch / Dynamic Island and the bottom the home indicator; with
// no inset there is a small floor so controls never touch the edge. Pure: the caller passes insets.

import { space } from "./theme";

export function cameraFramePadding(insets: { top: number; bottom: number }): { top: number; bottom: number } {
  return { top: Math.max(insets.top, space.md) + space.sm, bottom: insets.bottom + space.lg };
}
