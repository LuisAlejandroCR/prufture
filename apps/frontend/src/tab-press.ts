// tab-press.ts: what a tap on a bottom tab does. Another tab: navigate. The tab you are on: nothing
// here, because the emitted `tabPress` event lets useScrollToTop scroll that page back to the top
// (the iOS convention). Pure, no React Native.

export type TabPressAction = "navigate" | "scroll-to-top" | "none";

export function tabPressAction(o: { focused: boolean; defaultPrevented: boolean }): TabPressAction {
  if (o.defaultPrevented) return "none";
  return o.focused ? "scroll-to-top" : "navigate";
}
