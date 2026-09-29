// HeroPhone.tsx: the real reporter journey playing inside the landing's device frame.
// Playback starts from the effect only (never the autoplay attribute), slowed to a readable pace;
// reduced-motion visitors receive the poster only.

"use client";

import { useEffect, useRef } from "react";

// The capture runs faster than a visitor can read the screens; 0.6 keeps each step legible.
const PLAYBACK_RATE = 0.6;

export function HeroPhone() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = PLAYBACK_RATE;
    video.playbackRate = PLAYBACK_RATE;
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
