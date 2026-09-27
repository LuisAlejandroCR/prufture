// nav.ts: pure paging helpers for the /pitch deck (index wrap + keyboard mapping).
// No React or DOM, so it is unit-tested in isolation; Deck.tsx wires these to events.

export function wrapIndex(n: number, len: number): number {
  if (len <= 0) return 0;
  return ((n % len) + len) % len;
}

export type Page = "next" | "prev" | "first" | "last" | null;

export function pageFromKey(key: string): Page {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}
