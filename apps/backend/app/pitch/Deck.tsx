// Deck.tsx: client pager for the /pitch slides (content lives in page.tsx). One slide shows at a time;
// arrow keys, on-screen arrows, side-third clicks and swipes navigate, with a "N / total" indicator.
// prefers-reduced-motion drops the fade.

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { pageFromKey, wrapIndex } from "./nav";

export default function Deck({ slides }: { slides: ReactNode[] }) {
  const total = slides.length;
  const [i, setI] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const step = useCallback(
    (dir: number) => setI((cur) => wrapIndex(cur + dir, total)),
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = pageFromKey(e.key);
      if (!p) return;
      e.preventDefault();
      if (p === "next") step(1);
      else if (p === "prev") step(-1);
      else if (p === "first") setI(0);
      else if (p === "last") setI(total - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, total]);

  const onSlideClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    step(e.clientX < window.innerWidth * 0.35 ? -1 : 1);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    const t = e.changedTouches[0];
    touchStart.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 45) return;
    step(dx < 0 ? 1 : -1);
  };

  return (
    <div
      className="pitch-deck"
      role="group"
      aria-roledescription="carousel"
      aria-label="Prufture pitch deck"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((slide, k) => (
        <section
          key={k}
          className="pitch-slide"
          data-active={k === i}
          aria-roledescription="slide"
          aria-label={`Slide ${k + 1} of ${total}`}
          aria-hidden={k !== i}
          onClick={onSlideClick}
        >
          <div className="pitch-slide-inner">{slide}</div>
        </section>
      ))}

      <nav className="pitch-nav" aria-label="Slide navigation">
        <button className="pitch-arrow" onClick={() => step(-1)} aria-label="Previous slide">
          &lsaquo;
        </button>
        <span className="pitch-count" aria-live="polite">
          {i + 1} / {total}
        </span>
        <button className="pitch-arrow" onClick={() => step(1)} aria-label="Next slide">
          &rsaquo;
        </button>
      </nav>
    </div>
  );
}
