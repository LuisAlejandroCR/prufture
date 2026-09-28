// QrCard.tsx: server-rendered inline-SVG QR code for the /pitch deck, or a labelled "TBD" placeholder
// when the URL is unset. Warm near-black on ivory (~13:1) scans fine and stays on-palette. Named
// QrCard, not Qr, to avoid a case-only filename clash with qr.ts on case-insensitive filesystems.

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
