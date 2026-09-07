// ShareLink.tsx: client control to copy the public verify URL.
// The URL carries only the proofHash — no volunteer identity, no media, no exact location —
// so it is safe to paste into WhatsApp, email or a chat. Styling is token-driven (globals.css).

"use client";

import { useState } from "react";

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap", margin: "var(--sp-3) 0" }}>
      <input
        className="field"
        readOnly
        value={url}
        aria-label="Public verification link"
        onFocus={(e) => e.currentTarget.select()}
        style={{ flex: "1 1 320px" }}
      />
      <button type="button" className={`btn ${copied ? "" : "secondary"}`} onClick={copy}>
        {copied ? "Copied" : "Copy share link"}
      </button>
    </div>
  );
}
