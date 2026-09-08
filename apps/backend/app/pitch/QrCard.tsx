// QrCard.tsx: renders a scannable QR code as inline SVG for the /pitch deck, or a labelled
// "TBD" placeholder when the target URL has not been filled in yet. Server component,
// no client JS. The QR sits on the warm ivory ground (palette token --bg #FBF6EF) with
// warm near-black modules (--text #1C1208) — ~13:1 contrast, scans fine, stays on-palette.
// Encoder lives in qr.ts (vendored, no dependency). Named QrCard, not Qr, to avoid a
// case-only filename clash with qr.ts on case-insensitive filesystems.

import { qrPath } from "./qr";

export default function QrCard({
  url,
  label,
  caption,
}: {
  url: string | null;
  label: string;
  caption: string;
}) {
  if (!url) {
    return (
      <figure className="pitch-qr">
        <div className="pitch-qr-slot" aria-hidden>
          QR
        </div>
        <figcaption>
          <span className="pitch-qr-label">{label}</span>
          <span className="pitch-tbd">TBD: {caption}</span>
        </figcaption>
      </figure>
    );
  }

  const { size, path } = qrPath(url);
  return (
    <figure className="pitch-qr">
      <svg
        className="pitch-qr-img"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`QR code linking to ${url}`}
      >
        <rect width={size} height={size} fill="#fbf6ef" />
        <path d={path} fill="#1c1208" />
      </svg>
      <figcaption>
        <span className="pitch-qr-label">{label}</span>
        <span className="pitch-qr-url">{url}</span>
      </figcaption>
    </figure>
  );
}
