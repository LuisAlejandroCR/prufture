// ScrollFilms.tsx: pinned, in-view playback for the landing-page field journey.
// Each clip is pinned while its track scrolls past and plays once at normal
// speed; reduced-motion visitors see the matching poster frame.

"use client";

import { useEffect, useRef } from "react";

const films = [
  {
    slug: "offline-capture",
    step: "01",
    eyebrow: "Capture offline",
    title: "Document the work where it happens.",
    copy: "A clear photo and a few short answers are enough. No signal is required.",
    align: "left",
  },
  {
    slug: "saved-safely",
    step: "02",
    eyebrow: "Saved safely",
    title: "Nothing disappears with the network.",
    copy: "The report stays on the phone, ready for the moment connectivity returns.",
    align: "right",
  },
  {
    slug: "signal-returns",
    step: "03",
    eyebrow: "Signal returns",
    title: "Sending happens in the background.",
    copy: "The queued report moves forward automatically without asking the reporter to start over.",
    align: "left",
  },
  {
    slug: "community-review",
    step: "04",
    eyebrow: "Community review",
    title: "A shared record becomes visible.",
    copy: "Programme teams can review the activity while the reporter stays private.",
    align: "right",
  },
] as const;

export function ScrollFilms() {
  const reelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = reelRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Play at normal speed once the pinned card is mostly on screen; the clip
    // holds its last frame when it ends and scrolling is never blocked.
    const player = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target.querySelector("video");
          if (!video) return;
          if (entry.isIntersecting) {
            if (video.paused && !video.ended) void video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.6 },
    );

    // Rewind once a track is fully off screen so the clip replays on return.
    const rewinder = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector("video");
        if (video && !entry.isIntersecting) {
          video.pause();
          video.currentTime = 0;
        }
      });
    });

    root.querySelectorAll<HTMLElement>(".scroll-film").forEach((film) => player.observe(film));
    root.querySelectorAll<HTMLElement>(".film-track").forEach((track) => rewinder.observe(track));
    return () => {
      player.disconnect();
      rewinder.disconnect();
    };
  }, []);

  return (
    <div className="film-reel" ref={reelRef}>
      {films.map((film) => (
        <div className="film-track" key={film.slug}>
          <article className={`scroll-film film-${film.slug}`}>
            <video
              aria-hidden="true"
              muted
              playsInline
              poster={`/media/${film.slug}.webp`}
              preload="auto"
            >
              <source src={`/media/${film.slug}.mp4`} type="video/mp4" />
            </video>
            <div className="film-shade" aria-hidden="true" />
            <div className={`film-copy film-copy-${film.align}`}>
              <p><span>{film.step}</span> {film.eyebrow}</p>
              <h3>{film.title}</h3>
              <div className="film-rule" />
              <p>{film.copy}</p>
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}
