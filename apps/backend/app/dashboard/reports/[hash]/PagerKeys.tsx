// PagerKeys.tsx: keyboard stepping on the report review page — "k" for the previous report and
// "j" for the next one in the same filtered view (the convention of most review queues). Ignored
// while typing in a field or with a modifier held; renders nothing.

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PagerKeys({ prev, next }: { prev: string | null; next: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const href = e.key === "j" ? next : e.key === "k" ? prev : null;
      if (href) router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);
  return null;
}
