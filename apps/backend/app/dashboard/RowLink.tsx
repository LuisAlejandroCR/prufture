// RowLink.tsx: a table row that opens `href` when clicked anywhere on it, so a row that highlights
// on hover also behaves like the link it looks like. The row keeps its real <a> (the "Open" link or
// the area chip) for keyboard and screen-reader users; this only widens the mouse/touch target.
// Clicks on an inner link, button or field, and clicks that end a text selection, are left alone;
// Ctrl/Cmd or middle click opens a new tab, like a link.

"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { rowClickAction } from "../../lib/row-click";

export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as Element | null;
    const action = rowClickAction({
      insideControl: !!target?.closest("a,button,input,select,textarea,label,summary"),
      selecting: (window.getSelection()?.toString() ?? "") !== "",
      newTab: e.metaKey || e.ctrlKey || e.button === 1,
    });
    if (action === "tab") window.open(href, "_blank", "noopener");
    else if (action === "go") router.push(href);
  };

  return (
    <tr className="is-rowlink" onClick={onClick} onAuxClick={(e) => (e.button === 1 ? onClick(e) : undefined)}>
      {children}
    </tr>
  );
}
