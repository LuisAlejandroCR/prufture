// keyboard.ts: how the screen frame reacts to the on-screen keyboard on each platform. iOS draws the
// keyboard over the window, so the frame pads itself and the scroll view keeps the focused field in
// view; Android already resizes the window. Pure: the caller passes Platform.OS.

export interface KeyboardFrame {
  /** KeyboardAvoidingView behavior; undefined leaves resizing to the OS. */
  avoidBehavior: "padding" | undefined;
  /** ScrollView automaticallyAdjustKeyboardInsets (iOS only). */
  adjustInsets: boolean;
  /** ScrollView keyboardDismissMode. */
  dismissMode: "interactive" | "on-drag";
}

export function keyboardFrame(os: string): KeyboardFrame {
  if (os === "ios") return { avoidBehavior: "padding", adjustInsets: true, dismissMode: "interactive" };
  return { avoidBehavior: undefined, adjustInsets: false, dismissMode: "on-drag" };
}
