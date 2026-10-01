// row-click.ts: what a click on a clickable dashboard row should do. Pure, so the rule is tested.

export interface RowClick {
  /** The click landed on (or inside) a real control — let that control handle it. */
  insideControl: boolean;
  /** The user just selected text in the row (copying a region code, a date). */
  selecting: boolean;
  /** Ctrl/Cmd held, or middle button. */
  newTab: boolean;
}

export function rowClickAction(c: RowClick): "go" | "tab" | "none" {
  if (c.insideControl || c.selecting) return "none";
  return c.newTab ? "tab" : "go";
}
