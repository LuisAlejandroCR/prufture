// QrCard.tsx: install card on the landing page (Android preview APK or iOS TestFlight).
// The QR opens full screen in a native <dialog> so a judge can scan it from a shared
// screen or across a desk.
"use client";

import { useRef } from "react";

function ExpandIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M17 3l-6 6M8 17H3v-5M3 17l6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

type QrCardProps = {
  href: string;
  size: number;
  path: string;
  platform: string;
  label: string;
  title: string;
  note: string;
  scanHint: string;
};

export function QrCard({ href, size, path, platform, label, title, note, scanHint }: QrCardProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = () => dialog.current?.showModal();
  const close = () => dialog.current?.close();
  const qr = (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code to install the ${platform} preview`}>
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#1c1c1e" />
    </svg>
  );

  return (
    <div className="download-card">
      <button type="button" className="qr-open" onClick={open} aria-label="Show the QR code full screen">{qr}</button>
      <a className="download-copy" href={href} target="_blank" rel="noreferrer noopener">
        <small>{label}</small><strong>{title}</strong><em>{note}</em>
      </a>
      <button type="button" className="qr-expand" onClick={open} aria-label="Show the QR code full screen"><ExpandIcon /></button>
      <dialog ref={dialog} className="qr-dialog" aria-label={`${platform} preview QR code`} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className="qr-dialog-body">
          {qr}
          <p>{scanHint}</p>
          <div className="qr-dialog-actions">
            <a className="landing-btn landing-btn-ghost" href={href} target="_blank" rel="noreferrer noopener">Open install page</a>
            <button type="button" className="landing-btn landing-btn-primary" onClick={close}>Close</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
