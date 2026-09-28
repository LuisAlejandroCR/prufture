// ScrollFilms.tsx: scroll-scrubbed playback for the landing-page field journey.
// Each clip is pinned while its track scrolls past, and scroll progress drives
// video.currentTime; reduced-motion visitors see the matching poster frame.

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

// Fraction of a track's scroll distance travelled, clamped to [0, 1].
function trackProgress(track: HTMLElement): number {
  const rect = track.getBoundingClientRect();
  const distance = rect.height - window.innerHeight;
  if (distance <= 0) return rect.top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -rect.top / distance));
}

export function ScrollFilms() {
  const reelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = reelRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tracks = Array.from(root.querySelectorAll<HTMLElement>(".film-track"));
    const pairs = tracks.flatMap((track) => {
      const video = track.querySelector("video");
      return video ? [{ track, video }] : [];
    });

    // Mobile Safari only paints seeked frames after the element has played once.
    pairs.forEach(({ video }) => {
      void video.play().then(() => video.pause()).catch(() => undefined);
    });

    let frame = 0;
    const scrub = () => {
      frame = 0;
      pairs.forEach(({ track, video }) => {
        if (!video.duration || Number.isNaN(video.duration)) return;
        const target = trackProgress(track) * (video.duration - 0.05);
        if (Math.abs(video.currentTime - target) > 1 / 48) video.currentTime = target;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scrub);
    };

    pairs.forEach(({ video }) => video.addEventListener("loadedmetadata", schedule));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      pairs.forEach(({ video }) => video.removeEventListener("loadedmetadata", schedule));
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
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
