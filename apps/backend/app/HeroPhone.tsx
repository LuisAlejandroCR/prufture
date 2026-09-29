// HeroPhone.tsx: the real reporter journey playing inside the landing's device frame.
// Playback starts from the effect only (never the autoplay attribute); the file itself is encoded at
// half speed so every browser plays it at a readable pace;
// reduced-motion visitors receive the poster only.

"use client";

import { useEffect, useRef } from "react";

export function HeroPhone() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => undefined);
  }, []);

  return (
    <>
      <video ref={videoRef} className="phone-journey" loop muted playsInline preload="metadata" poster="/media/app-journey.webp">
        <source src="/media/app-journey.mp4" type="video/mp4" />
      </video>
      <div className="phone-reflection" />
    </>
  );
}
